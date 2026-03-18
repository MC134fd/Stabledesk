import type { TreasuryState } from "./treasury-state.js";
import { emptyState, buildState } from "./treasury-state.js";
import { evaluatePolicy, type PolicyDecision } from "./liquidity-policy.js";
import type { TreasuryPolicy } from "../config/policy.js";
import type { TokenClient } from "../integrations/usdc.js";
import type { LendingManager } from "../integrations/lending/manager.js";
import type { KoraClient } from "../integrations/kora.js";
import type { SolanaClient } from "../integrations/solana.js";
import { paymentStore } from "../payments/payment-store.js";
import { auditService } from "../audit/audit-service.js";
import { createLogger } from "../audit/logger.js";

const log = createLogger("scheduler");

export interface SchedulerDeps {
  solana: SolanaClient;
  tokenClient: TokenClient;
  lendingManager: LendingManager;
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
    const [liquidBalances, portfolio, slot] = await Promise.all([
      deps.tokenClient.getAllBalances(),
      deps.lendingManager.getPortfolio(),
      deps.solana.getSlot(),
    ]);

    // Sum pending payment obligations
    const pending = paymentStore.findByStatus("pending");
    const processing = paymentStore.findByStatus("processing");
    const pendingObligations = [...pending, ...processing].reduce(
      (sum, p) => sum + p.amountUsdc,
      0n,
    );

    currentState = buildState(liquidBalances, portfolio.positions, pendingObligations, slot);
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
        totalLiquid: state.totalLiquid.toString(),
        totalDeployed: state.totalDeployed.toString(),
        totalAum: state.totalAum.toString(),
        tokens: [...state.balances.keys()].join(","),
        positions: state.lendingPositions.length,
        pending: state.pendingObligations.toString(),
      });

      // 2. Evaluate policy (uses aggregate multi-token totals)
      const decision = evaluatePolicy(state, deps.policy);
      lastDecision = decision;
      log.info("Policy evaluated", { reason: decision.reason, rebalance: decision.rebalance.type });

      // 3. Execute rebalancing — uses lending manager for optimal routing
      //    The policy decision now includes the target token for rebalancing.
      if (decision.rebalance.type === "deposit") {
        const token = decision.rebalance.token;
        try {
          const { protocol, tx } = await deps.lendingManager.buildOptimalDepositTx(
            token, decision.rebalance.amountUsdc,
          );
          const sig = await deps.kora.sendTransaction(tx);
          auditService.record("rebalance.deposit", {
            protocol,
            token,
            amount: decision.rebalance.amountUsdc.toString(),
            txSignature: sig,
          }, "success");
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          auditService.record("rebalance.deposit", {
            token,
            amount: decision.rebalance.amountUsdc.toString(),
            reason,
          }, "failure");
          log.error("Rebalance deposit failed", { reason });
        }
      } else if (decision.rebalance.type === "withdraw") {
        const token = decision.rebalance.token;
        try {
          const withdrawTxs = await deps.lendingManager.buildOptimalWithdrawTxs(
            token, decision.rebalance.amountUsdc,
          );
          for (const { protocol, tx, amount } of withdrawTxs) {
            const sig = await deps.kora.sendTransaction(tx);
            auditService.record("rebalance.withdraw", {
              protocol,
              token,
              amount: amount.toString(),
              txSignature: sig,
            }, "success");
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          auditService.record("rebalance.withdraw", {
            token,
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
        totalLiquid: state.totalLiquid.toString(),
        totalDeployed: state.totalDeployed.toString(),
        protocols: state.lendingPositions.map((p) => p.protocol).filter(
          (v, i, a) => a.indexOf(v) === i,
        ).join(","),
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
      tick().catch((err) => {
        log.error("Initial tick failed", { reason: String(err) });
      });
      timer = setInterval(tick, deps.intervalSeconds * 1000);
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
        log.info("Scheduler stopped");
      }
    },

    tick,
  };
}
