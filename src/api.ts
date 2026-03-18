import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Hono } from "hono";
import { paymentStore } from "./payments/payment-store.js";
import { auditService } from "./audit/audit-service.js";
import { fmtUsdc } from "./core/liquidity-policy.js";
import { formatTokenAmount } from "./config/stablecoins.js";
import type { TreasuryState } from "./core/treasury-state.js";
import type { PaymentRequest } from "./payments/payment-types.js";
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

interface ApiDeps {
  getState: () => TreasuryState;
  getLastDecision: () => unknown;
  lendingManager: LendingManager;
  paymentService: {
    createPayment(req: PaymentRequest): unknown;
    processPayment(id: string): Promise<unknown>;
  };
}

export function createApi(deps: ApiDeps) {
  const app = new Hono();

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
    const payments = status
      ? paymentStore.findByStatus(status as any)
      : paymentStore.all();
    return c.json(
      payments.map((p) => ({
        ...p,
        amountUsdc: p.amountUsdc.toString(),
        amountFormatted: fmtUsdc(p.amountUsdc),
      })),
    );
  });

  // Create a payment
  app.post("/payments", async (c) => {
    try {
      const body = await c.req.json();
      const { recipient, amountUsdc, memo, scheduledAt } = body;

      if (!recipient || !amountUsdc) {
        return c.json({ error: "recipient and amountUsdc are required" }, 400);
      }

      const req: PaymentRequest = {
        recipient,
        amountUsdc: BigInt(amountUsdc),
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

  // Process a specific payment immediately
  app.post("/payments/:id/process", async (c) => {
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
