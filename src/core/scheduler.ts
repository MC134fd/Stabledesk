import type { TreasuryState } from './treasury-state.js';
import { evaluateLiquidityPolicy } from './liquidity-policy.js';
import { buildTreasuryState, emptyState } from './treasury-state.js';
import type { PaymentService } from '../payments/payment-service.js';
import type { AuditService } from '../audit/audit-service.js';
import type { SolanaClient } from '../integrations/solana.js';
import type { LendingManager } from '../integrations/lending/manager.js';
import type { TreasuryPolicy } from '../config/policy.js';
import { logger } from '../audit/logger.js';

export type SchedulerAction =
  | 'would_deposit'
  | 'would_withdraw'
  | 'would_execute_payment'
  | 'no_action';

export type SchedulerDecision = {
  stateSnapshot: TreasuryState;
  targetLiquidity: number;
  excessLiquidity: number;
  liquidityShortfall: number;
  actions: SchedulerAction[];
};

export type ExecutionMode = 'auto' | 'manual';

export type PendingRecommendation = {
  action: 'deposit' | 'withdraw';
  tokenSymbol: string;
  amountRaw: bigint; // serialized as string in JSON responses
  amountHuman: number;
};

export type SchedulerCycleDeps = {
  getTreasuryState: () => TreasuryState | Promise<TreasuryState>;
  paymentService: PaymentService;
  minLiquidUsdc: number;
  auditService?: AuditService;
};

// Stable output order — withdraw liquidity issues first, then execute, then optimize
const ACTION_ORDER: SchedulerAction[] = [
  'would_withdraw',
  'would_execute_payment',
  'would_deposit',
];

export async function runSchedulerCycle(deps: SchedulerCycleDeps): Promise<SchedulerDecision> {
  const {
    getTreasuryState,
    paymentService,
    minLiquidUsdc,
    auditService,
  } = deps;

  // Step 1: snapshot treasury state
  const stateSnapshot = await getTreasuryState();

  // Step 2: read pending payments
  const pending = paymentService.listPendingPayments();
  const pendingTotal = pending.reduce((sum, p) => sum + p.amount, 0);

  // Step 3: evaluate liquidity
  const { targetLiquidity, excessLiquidity, liquidityShortfall } = evaluateLiquidityPolicy({
    minLiquidUsdc,
    pendingPaymentsTotal: pendingTotal,
    currentLiquidUsdc: stateSnapshot.usdcBalance,
  });

  // Steps 4-5: update payment statuses; track whether any become/are ready
  let hasReadyPayments = false;

  for (const payment of pending) {
    if (liquidityShortfall > 0) {
      // Insufficient — re-label newly queued; don't demote already-ready/processing
      if (payment.status === 'queued') {
        paymentService.updatePaymentStatus(payment.id, 'awaiting_liquidity');
      } else if (payment.status === 'ready') {
        hasReadyPayments = true;
      }
    } else {
      // Sufficient — promote queued and blocked payments to ready
      if (payment.status === 'queued' || payment.status === 'awaiting_liquidity') {
        paymentService.updatePaymentStatus(payment.id, 'ready');
        hasReadyPayments = true;
      } else if (payment.status === 'ready') {
        hasReadyPayments = true;
      }
    }
  }

  // Step 6: determine actions (deduplicated, stable order)
  const found = new Set<SchedulerAction>();
  if (liquidityShortfall > 0 && pending.length > 0) found.add('would_withdraw');
  if (hasReadyPayments) found.add('would_execute_payment');
  if (excessLiquidity > 0) found.add('would_deposit');

  const actions: SchedulerAction[] = ACTION_ORDER.filter((a) => found.has(a));
  if (actions.length === 0) actions.push('no_action');

  // Step 7: record scheduler decision audit event
  const decision: SchedulerDecision = {
    stateSnapshot,
    targetLiquidity,
    excessLiquidity,
    liquidityShortfall,
    actions,
  };
  auditService?.recordEvent('scheduler_decision', {
    actions,
    targetLiquidity,
    excessLiquidity,
    liquidityShortfall,
  });

  return decision;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export type SchedulerHandle = {
  start(): void;
  stop(): void;
  getState(): TreasuryState;
  getLastDecision(): SchedulerDecision | null;
  getExecutionMode(): ExecutionMode;
  setExecutionMode(mode: ExecutionMode): void;
  getPendingRecommendation(): PendingRecommendation | null;
  executePendingRecommendation(): Promise<{ signatures: string[] }>;
};

export type SchedulerCreateConfig = {
  solana: SolanaClient;
  tokenClient: unknown;
  lendingManager: LendingManager;
  kora: unknown;
  policy: TreasuryPolicy;
  paymentService: PaymentService;
  intervalSeconds?: number;
  auditService?: AuditService;
};

export function createScheduler(config: SchedulerCreateConfig): SchedulerHandle {
  let currentState: TreasuryState = emptyState();
  let lastDecision: SchedulerDecision | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let executionMode: ExecutionMode = 'manual';
  let pendingRecommendation: PendingRecommendation | null = null;

  const intervalMs = (config.intervalSeconds ?? 60) * 1_000;
  const minLiquidUsdc = Number(config.policy.minLiquidReserveUsdc) / 1_000_000;

  async function executeRecommendation(rec: PendingRecommendation): Promise<{ signatures: string[] }> {
    const signatures: string[] = [];

    if (rec.action === 'deposit') {
      const { tx } = await config.lendingManager.buildOptimalDepositTx(rec.tokenSymbol, rec.amountRaw);
      const sig = await config.solana.sendAndConfirm(tx);
      signatures.push(sig);
    } else if (rec.action === 'withdraw') {
      const txs = await config.lendingManager.buildOptimalWithdrawTxs(rec.tokenSymbol, rec.amountRaw);
      for (const { tx } of txs) {
        const sig = await config.solana.sendAndConfirm(tx);
        signatures.push(sig);
      }
    }

    return { signatures };
  }

  async function tick(): Promise<void> {
    try {
      const decision = await runSchedulerCycle({
        getTreasuryState: () =>
          buildTreasuryState(
            config.solana.connection,
            config.solana.keypair.publicKey.toBase58(),
            () => config.paymentService.summarizePendingPayments(),
            async () => {
              // Sum all deployed USDC across lending protocols
              const portfolio = await config.lendingManager.getPortfolio();
              const usdcDeployed = portfolio.totalByToken.get('USDC') ?? 0n;
              return Number(usdcDeployed) / 1_000_000;
            },
          ),
        paymentService: config.paymentService,
        minLiquidUsdc,
        auditService: config.auditService,
      });
      currentState = decision.stateSnapshot;
      lastDecision = decision;

      // Determine pending recommendation
      if (decision.actions.includes('would_deposit') && decision.excessLiquidity > 0) {
        const amountHuman = decision.excessLiquidity;
        const amountRaw = BigInt(Math.floor(amountHuman * 1_000_000));
        pendingRecommendation = { action: 'deposit', tokenSymbol: 'USDC', amountRaw, amountHuman };
      } else if (decision.actions.includes('would_withdraw') && decision.liquidityShortfall > 0) {
        const amountHuman = Math.min(decision.liquidityShortfall, currentState.kaminoUsdcBalance);
        const amountRaw = BigInt(Math.floor(amountHuman * 1_000_000));
        pendingRecommendation = amountHuman > 0
          ? { action: 'withdraw', tokenSymbol: 'USDC', amountRaw, amountHuman }
          : null;
      } else {
        pendingRecommendation = null;
      }

      // Auto-execute if enabled
      if (executionMode === 'auto' && pendingRecommendation) {
        try {
          const result = await executeRecommendation(pendingRecommendation);
          logger.info('Auto-executed recommendation', {
            action: pendingRecommendation.action,
            signatures: result.signatures,
          });
          pendingRecommendation = null;
        } catch (err) {
          logger.error('Auto-execution failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      logger.error('Scheduler tick failed', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  }

  return {
    start() {
      void tick(); // first tick immediately
      intervalId = setInterval(() => { void tick(); }, intervalMs);
    },

    stop() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },

    getState() {
      return currentState;
    },

    getLastDecision() {
      return lastDecision;
    },

    getExecutionMode() {
      return executionMode;
    },

    setExecutionMode(mode: ExecutionMode) {
      executionMode = mode;
      logger.info('Execution mode changed', { mode });
    },

    getPendingRecommendation() {
      return pendingRecommendation;
    },

    async executePendingRecommendation() {
      if (!pendingRecommendation) {
        throw new Error('No pending recommendation to execute');
      }
      const result = await executeRecommendation(pendingRecommendation);
      pendingRecommendation = null;
      return result;
    },
  };
}
