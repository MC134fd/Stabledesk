import type { TreasuryState } from './treasury-state.js';
import { evaluateLiquidityPolicy } from './liquidity-policy.js';
import { buildTreasuryState, emptyState } from './treasury-state.js';
import type { PaymentService } from '../payments/payment-service.js';
import type { KaminoClient } from '../integrations/kamino.js';
import type { AuditService } from '../audit/audit-service.js';
import type { SolanaClient } from '../integrations/solana.js';
import type { LendingManager } from '../integrations/lending/manager.js';
import type { TreasuryPolicy } from '../config/policy.js';

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

export type SchedulerCycleDeps = {
  getTreasuryState: () => TreasuryState | Promise<TreasuryState>;
  paymentService: PaymentService;
  minLiquidUsdc: number;
  // Optional — added in Milestone 6
  kaminoClient?: KaminoClient;
  auditService?: AuditService;
  executionMode?: 'dry_run' | 'execute'; // default: 'dry_run'
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
    kaminoClient,
    auditService,
    executionMode = 'dry_run',
  } = deps;

  // Step 1: snapshot treasury state
  const stateSnapshot = await getTreasuryState();

  // Step 2: read pending payments
  const pending = paymentService.listPendingPayments();
  const pendingTotal = pending.reduce((sum, p) => sum + p.amountUsdc, 0);

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

  // Step 7: Kamino execution (execute mode only — payments remain dry-run)
  if (executionMode === 'execute' && kaminoClient) {
    if (found.has('would_withdraw')) {
      const withdrawAmount = Math.min(liquidityShortfall, stateSnapshot.kaminoUsdcBalance);
      if (withdrawAmount > 0) {
        auditService?.recordEvent('kamino_withdraw_attempt', { withdrawAmount });
        try {
          const result = await kaminoClient.withdrawFromKamino(withdrawAmount);
          auditService?.recordEvent('kamino_withdraw_success', result);
        } catch (err) {
          auditService?.recordEvent('kamino_withdraw_failure', { error: String(err) });
        }
      }
    }

    if (found.has('would_deposit')) {
      const depositAmount = excessLiquidity;
      if (depositAmount > 0) {
        auditService?.recordEvent('kamino_deposit_attempt', { depositAmount });
        try {
          const result = await kaminoClient.depositToKamino(depositAmount);
          auditService?.recordEvent('kamino_deposit_success', result);
        } catch (err) {
          auditService?.recordEvent('kamino_deposit_failure', { error: String(err) });
        }
      }
    }
  }

  // Step 8: record scheduler decision audit event
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
};

export type SchedulerCreateConfig = {
  solana: SolanaClient;
  tokenClient: unknown;
  lendingManager: LendingManager;
  kora: unknown;
  policy: TreasuryPolicy;
  paymentService: PaymentService;
  intervalSeconds?: number;
  usdcMint?: string;
  auditService?: AuditService;
};

export function createScheduler(config: SchedulerCreateConfig): SchedulerHandle {
  let currentState: TreasuryState = emptyState();
  let lastDecision: SchedulerDecision | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const intervalMs = (config.intervalSeconds ?? 60) * 1_000;
  const usdcMint = config.usdcMint ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const minLiquidUsdc = Number(config.policy.minLiquidReserveUsdc) / 1_000_000;

  async function tick(): Promise<void> {
    try {
      const decision = await runSchedulerCycle({
        getTreasuryState: () =>
          buildTreasuryState(
            config.solana.connection,
            config.solana.keypair.publicKey.toBase58(),
            usdcMint,
            () => config.paymentService.summarizePendingPayments(),
          ),
        paymentService: config.paymentService,
        minLiquidUsdc,
        auditService: config.auditService,
      });
      currentState = decision.stateSnapshot;
      lastDecision = decision;
    } catch {
      // Errors are non-fatal — next tick will retry
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
  };
}
