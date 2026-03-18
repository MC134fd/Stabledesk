import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PublicKey } from "@solana/web3.js";
import { Hono } from "hono";
import { paymentStore } from "./payments/payment-store.js";
import { auditService } from "./audit/audit-service.js";
import { fmtUsdc } from "./core/liquidity-policy.js";
import { formatTokenAmount } from "./config/stablecoins.js";
import type { TreasuryState } from "./core/treasury-state.js";
import type { PaymentRequest } from "./payments/payment-types.js";
import type { PaymentStatus } from "./payments/payment-types.js";
import type { LendingManager } from "./integrations/lending/manager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
let dashboardHtml: string;
try {
  dashboardHtml = readFileSync(join(__dirname, "public", "index.html"), "utf-8");
} catch {
  try {
    dashboardHtml = readFileSync(join(__dirname, "..", "src", "public", "index.html"), "utf-8");
  } catch {
    dashboardHtml = "<html><body><h1>Dashboard not found</h1></body></html>";
  }
}

const VALID_STATUSES: PaymentStatus[] = ["pending", "processing", "completed", "failed"];

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
  paymentService: {
    createPayment(req: PaymentRequest): unknown;
    processPayment(id: string): Promise<unknown>;
  };
  /** Optional API key for write operations. If set, POST requests require Bearer token. */
  apiKey?: string;
}

export function createApi(deps: ApiDeps) {
  const app = new Hono();

  // API key auth middleware for mutating endpoints
  const requireAuth = (c: any, next: () => Promise<void>) => {
    if (!deps.apiKey) return next(); // no key configured = open access
    const auth = c.req.header("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== deps.apiKey) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  };

  // Dashboard
  app.get("/", (c) => c.html(dashboardHtml));

  // Health check
  app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

  // Treasury state (backward-compatible + new multi-token data)
  app.get("/state", (c) => {
    const s = deps.getState();

    // Build per-token breakdown
    const tokenBreakdown: Record<string, any> = {};
    for (const [symbol, bal] of s.balances) {
      const byProtocol: Record<string, string> = {};
      for (const [proto, amount] of bal.deployedByProtocol) {
        byProtocol[proto] = amount.toString();
      }
      tokenBreakdown[symbol] = {
        liquid: bal.liquid.toString(),
        deployed: bal.deployed.toString(),
        total: (bal.liquid + bal.deployed).toString(),
        deployedByProtocol: byProtocol,
      };
    }

    // Build per-protocol APY summary
    const protocolSummary = s.lendingPositions.map((p) => ({
      protocol: p.protocol,
      token: p.token,
      deposited: p.depositedAmount.toString(),
      apy: p.supplyApy,
    }));

    return c.json({
      // Legacy fields (dashboard expects these)
      liquidUsdc: s.liquidUsdc.toString(),
      liquidUsdcFormatted: fmtUsdc(s.liquidUsdc),
      kaminoDeposited: s.kaminoDeposited.toString(),
      kaminoDepositedFormatted: fmtUsdc(s.kaminoDeposited),
      totalUsdc: s.totalUsdc.toString(),
      totalUsdcFormatted: fmtUsdc(s.totalUsdc),
      pendingObligations: s.pendingObligations.toString(),
      lastUpdatedSlot: s.lastUpdatedSlot,
      lastUpdatedAt: s.lastUpdatedAt,
      lastDecision: deps.getLastDecision(),
      // New multi-token/multi-protocol fields
      totalLiquid: s.totalLiquid.toString(),
      totalDeployed: s.totalDeployed.toString(),
      totalAum: s.totalAum.toString(),
      tokens: tokenBreakdown,
      positions: protocolSummary,
    });
  });

  // Lending: list all positions across all protocols
  app.get("/lending", async (c) => {
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
  app.get("/lending/best-apy/:token", async (c) => {
    const token = c.req.param("token").toUpperCase();
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
  app.get("/payments", (c) => {
    const status = c.req.query("status");
    if (status && !VALID_STATUSES.includes(status as PaymentStatus)) {
      return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, 400);
    }
    const payments = status
      ? paymentStore.findByStatus(status as PaymentStatus)
      : paymentStore.all();
    return c.json(
      payments.map((p) => ({
        ...p,
        amountUsdc: p.amountUsdc.toString(),
        amountFormatted: fmtUsdc(p.amountUsdc),
      })),
    );
  });

  // Create a payment (requires auth if API key is configured)
  app.post("/payments", requireAuth, async (c) => {
    try {
      const body = await c.req.json();
      const { recipient, amountUsdc, memo, scheduledAt } = body;

      if (!recipient || amountUsdc === undefined || amountUsdc === null) {
        return c.json({ error: "recipient and amountUsdc are required" }, 400);
      }

      // Validate recipient is a valid Solana public key
      if (typeof recipient !== "string" || !isValidPublicKey(recipient)) {
        return c.json({ error: "recipient must be a valid Solana public key" }, 400);
      }

      // Validate amountUsdc is a non-negative integer (string or number)
      const amountStr = String(amountUsdc);
      if (!/^\d+$/.test(amountStr)) {
        return c.json({ error: "amountUsdc must be a non-negative integer (micro-USDC)" }, 400);
      }

      const parsedAmount = BigInt(amountStr);

      const req: PaymentRequest = {
        recipient,
        amountUsdc: parsedAmount,
        memo,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      };

      const record = deps.paymentService.createPayment(req);
      return c.json(record, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  // Process a specific payment immediately (requires auth)
  app.post("/payments/:id/process", requireAuth, async (c) => {
    try {
      const record = await deps.paymentService.processPayment(c.req.param("id"));
      return c.json(record);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  // Audit log
  app.get("/audit", (c) => {
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
