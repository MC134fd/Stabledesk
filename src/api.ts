import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PublicKey } from "@solana/web3.js";
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { auditService } from "./audit/audit-service.js";
import { fmtUsdc } from "./core/liquidity-policy.js";
import type { TreasuryState } from "./core/treasury-state.js";
import type { CreatePaymentInput, PaymentStatus } from "./payments/payment-types.js";
import type { LendingManager } from "./integrations/lending/manager.js";
import type { PaymentService } from "./payments/payment-service.js";
import { createAuthRoutes } from "./auth/auth-routes.js";
import { requireSession } from "./middleware/session-auth.js";
import { getSession, SESSION_COOKIE } from "./auth/sessions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readHtml(filename: string): string {
  try {
    return readFileSync(join(__dirname, "public", filename), "utf-8");
  } catch {
    try {
      return readFileSync(join(__dirname, "..", "src", "public", filename), "utf-8");
    } catch {
      return `<html><body><h1>${filename} not found</h1></body></html>`;
    }
  }
}

const dashboardHtml = readHtml("index.html");
const welcomeHtml = readHtml("welcome.html");
const loginHtml = readHtml("login.html");

const VALID_STATUSES: PaymentStatus[] = ["queued", "awaiting_liquidity", "ready", "processing", "sent", "failed"];

/** Validate that a string is a valid base58 Solana public key */
function isValidPublicKey(str: string): boolean {
  try {
    new PublicKey(str);
    return true;
  } catch {
    return false;
  }
}

interface ApiDeps {
  getState: () => TreasuryState;
  getLastDecision: () => unknown;
  lendingManager: LendingManager;
  paymentService: PaymentService;
  /** Optional API key for write operations. If set, POST requests require Bearer token. */
  apiKey?: string;
}

export function createApi(deps: ApiDeps) {
  const app = new Hono();

  // API key auth middleware for mutating endpoints
  const requireAuth = (c: Context, next: () => Promise<void>) => {
    if (!deps.apiKey) return next(); // no key configured = open access
    const auth = c.req.header("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== deps.apiKey) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  };

  // Auth routes (/auth/register, /auth/login, /auth/logout, /auth/me)
  app.route("/auth", createAuthRoutes());

  // Root: redirect to /app (or /welcome if unauthenticated)
  app.get("/", (c: Context) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (sessionId && getSession(sessionId)) return c.redirect("/app");
    return c.redirect("/welcome");
  });

  // Welcome page (public)
  app.get("/welcome", (c: Context) => c.html(welcomeHtml));

  // Login page (redirect to /app if already authenticated)
  app.get("/login", (c: Context) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (sessionId && getSession(sessionId)) return c.redirect("/app");
    return c.html(loginHtml);
  });

  // App dashboard (session-protected)
  app.get("/app", requireSession, (c: Context) => c.html(dashboardHtml));

  // Health check
  app.get("/health", (c: Context) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

  // Treasury state
  app.get("/state", (c: Context) => {
    const s = deps.getState();

    return c.json({
      // Core fields
      liquidUsdc: s.usdcBalance.toFixed(6),
      liquidUsdcFormatted: fmtUsdc(s.usdcBalance),
      kaminoDeposited: s.kaminoUsdcBalance.toFixed(6),
      kaminoDepositedFormatted: fmtUsdc(s.kaminoUsdcBalance),
      totalUsdc: s.totalUsdcExposure.toFixed(6),
      totalUsdcFormatted: fmtUsdc(s.totalUsdcExposure),
      pendingObligations: s.pendingPaymentsTotal.toFixed(6),
      lastUpdatedAt: s.lastUpdatedAt,
      lastDecision: deps.getLastDecision(),
      // Aggregated multi-token totals (USDC-only for now)
      totalLiquid: s.usdcBalance.toFixed(6),
      totalDeployed: s.kaminoUsdcBalance.toFixed(6),
      totalAum: s.totalUsdcExposure.toFixed(6),
      // Multi-token/multi-protocol stubs (future milestone)
      tokens: {},
      positions: [],
    });
  });

  // Lending: list all positions across all protocols
  app.get("/lending", async (c: Context) => {
    const portfolio = await deps.lendingManager.getPortfolio();
    return c.json({
      positions: portfolio.positions.map((p) => ({
        protocol: p.protocol,
        token: p.token,
        mint: p.mint,
        deposited: p.depositedAmount.toString(),
        apy: p.supplyApy,
        apyFormatted: `${(p.supplyApy * 100).toFixed(2)}%`,
      })),
      totalByToken: Object.fromEntries(
        [...portfolio.totalByToken].map(([k, v]) => [k, v.toString()]),
      ),
      totalValueUsdc: portfolio.totalValueUsdc.toString(),
    });
  });

  // Lending: get best APY for a token
  app.get("/lending/best-apy/:token", async (c: Context) => {
    const token = (c.req.param("token") ?? "").toUpperCase();
    const best = await deps.lendingManager.getBestApy(token);
    if (!best) return c.json({ error: `No protocol supports ${token}` }, 404);
    return c.json({
      token,
      protocol: best.protocol,
      apy: best.apy,
      apyFormatted: `${(best.apy * 100).toFixed(2)}%`,
    });
  });

  // List payments
  app.get("/payments", (c: Context) => {
    const status = c.req.query("status");
    if (status && !VALID_STATUSES.includes(status as PaymentStatus)) {
      return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, 400);
    }
    const payments = status
      ? deps.paymentService.listPayments().filter((p) => p.status === (status as PaymentStatus))
      : deps.paymentService.listPayments();
    return c.json(
      payments.map((p) => ({
        ...p,
        amountUsdcFormatted: fmtUsdc(p.amountUsdc),
      })),
    );
  });

  // Create a payment (requires auth if API key is configured)
  app.post("/payments", requireAuth, async (c: Context) => {
    try {
      const body = await c.req.json() as Record<string, unknown>;
      const { recipient, amountUsdc, reference, dueAt } = body;

      if (!recipient || amountUsdc === undefined || amountUsdc === null) {
        return c.json({ error: "recipient and amountUsdc are required" }, 400);
      }

      // Validate recipient is a valid Solana public key
      if (typeof recipient !== "string" || !isValidPublicKey(recipient)) {
        return c.json({ error: "recipient must be a valid Solana public key" }, 400);
      }

      // Validate amountUsdc is a positive number
      const parsedAmount = typeof amountUsdc === "string" ? parseFloat(amountUsdc) : Number(amountUsdc);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return c.json({ error: "amountUsdc must be a positive number (human USDC, e.g. 100 = 100 USDC)" }, 400);
      }

      const input: CreatePaymentInput = {
        recipient,
        amountUsdc: parsedAmount,
        ...(typeof reference === "string" && { reference }),
        ...(typeof dueAt === "string" && { dueAt }),
      };

      const record = deps.paymentService.createPayment(input);
      return c.json(record, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  // Process a specific payment immediately (requires auth)
  app.post("/payments/:id/process", requireAuth, async (c: Context) => {
    try {
      const id = c.req.param("id");
      if (!id) return c.json({ error: "Payment ID required" }, 400);
      const record = await deps.paymentService.processPayment(id);
      return c.json(record);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  // Audit log
  app.get("/audit", (c: Context) => {
    const action = c.req.query("action");
    const since = c.req.query("since");
    const events = auditService.query({
      action: action || undefined,
      since: since ? new Date(since) : undefined,
    });
    return c.json(events);
  });

  return app;
}
