import type { TreasuryState } from "./treasury-state.js";
import { emptyState } from "./treasury-state.js";
import { evaluatePolicy, type PolicyDecision } from "./liquidity-policy.js";
import type { TreasuryPolicy } from "../config/policy.js";
import type { UsdcClient } from "../integrations/usdc.js";
import type { KaminoClient } from "../integrations/kamino.js";
import type { KoraClient } from "../integrations/kora.js";
import type { SolanaClient } from "../integrations/solana.js";
import { paymentStore } from "../payments/payment-store.js";
import { auditService } from "../audit/audit-service.js";
import { createLogger } from "../audit/logger.js";

const log = createLogger("scheduler");

export interface SchedulerDeps {
  solana: SolanaClient;
  usdc: UsdcClient;
  kamino: KaminoClient;
  kora: KoraClient;
  policy: TreasuryPolicy;
  paymentService: { processPending(): Promise<number> };
  intervalSeconds: number;
}

export function createScheduler(deps: SchedulerDeps) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let currentState: TreasuryState = emptyState();
  let lastDecision: PolicyDecision | null = null;

  async function refreshState(): Promise<TreasuryState> {
    const [liquidUsdc, kaminoPos, slot] = await Promise.all([
      deps.usdc.getBalance(),
      deps.kamino.getPosition(),
      deps.solana.getSlot(),
    ]);

    // Sum pending payment obligations
    const pending = paymentStore.findByStatus("pending");
    const processing = paymentStore.findByStatus("processing");
    const pendingObligations = [...pending, ...processing].reduce(
      (sum, p) => sum + p.amountUsdc,
      0n,
    );

    currentState = {
      liquidUsdc,
      kaminoDeposited: kaminoPos.depositedUsdc,
      totalUsdc: liquidUsdc + kaminoPos.depositedUsdc,
      pendingObligations,
      lastUpdatedSlot: slot,
      lastUpdatedAt: new Date().toISOString(),
    };

    return currentState;
  }

  async function tick(): Promise<void> {
    if (running) {
      log.warn("Skipping tick — previous tick still running");
      return;
    }
    running = true;

    try {
      // 1. Refresh state from chain
      const state = await refreshState();
      log.info("State refreshed", {
        liquid: state.liquidUsdc.toString(),
        kamino: state.kaminoDeposited.toString(),
        total: state.totalUsdc.toString(),
        pending: state.pendingObligations.toString(),
      });

      // 2. Evaluate policy
      const decision = evaluatePolicy(state, deps.policy);
      lastDecision = decision;
      log.info("Policy evaluated", { reason: decision.reason, rebalance: decision.rebalance.type });

      // 3. Execute rebalancing if needed
      if (decision.rebalance.type === "deposit") {
        try {
          const tx = await deps.kamino.buildDepositTx(decision.rebalance.amountUsdc);
          const sig = await deps.kora.sendTransaction(tx);
          auditService.record("rebalance.deposit", {
            amount: decision.rebalance.amountUsdc.toString(),
            txSignature: sig,
          }, "success");
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          auditService.record("rebalance.deposit", {
            amount: decision.rebalance.amountUsdc.toString(),
            reason,
          }, "failure");
          log.error("Rebalance deposit failed", { reason });
        }
      } else if (decision.rebalance.type === "withdraw") {
        try {
          const tx = await deps.kamino.buildWithdrawTx(decision.rebalance.amountUsdc);
          const sig = await deps.kora.sendTransaction(tx);
          auditService.record("rebalance.withdraw", {
            amount: decision.rebalance.amountUsdc.toString(),
            txSignature: sig,
          }, "success");
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          auditService.record("rebalance.withdraw", {
            amount: decision.rebalance.amountUsdc.toString(),
            reason,
          }, "failure");
          log.error("Rebalance withdraw failed", { reason });
        }
      }

      // 4. Process pending payments
      if (decision.canProcessPayments) {
        const processed = await deps.paymentService.processPending();
        if (processed > 0) {
          log.info("Processed payments", { count: processed });
        }
      }

      auditService.record("scheduler.tick", {
        liquid: state.liquidUsdc.toString(),
        kamino: state.kaminoDeposited.toString(),
        rebalance: decision.rebalance.type,
        paymentsProcessable: decision.canProcessPayments,
      }, "success");
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log.error("Scheduler tick failed", { reason });
      auditService.record("scheduler.tick", { reason }, "failure");
    } finally {
      running = false;
    }
  }

  return {
    getState: () => currentState,
    getLastDecision: () => lastDecision,

    start() {
      if (timer) return;
      log.info("Scheduler starting", { intervalSeconds: deps.intervalSeconds });
      // Run first tick immediately
      tick();
      timer = setInterval(tick, deps.intervalSeconds * 1000);
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
        log.info("Scheduler stopped");
      }
    },

    /** Manual trigger for testing/debugging */
    tick,
  };
}
