import { loadEnv } from '../config/env.js';
import { solanaClient } from '../integrations/solana.js';
import { buildTreasuryState } from '../core/treasury-state.js';
import { createPaymentService } from '../payments/payment-service.js';
import { runSchedulerCycle } from '../core/scheduler.js';

const MIN_LIQUID_USDC = Number(process.env['MIN_LIQUID_USDC'] ?? '500');

export const runScheduler = async (): Promise<void> => {
  const config = loadEnv();
  const connection = solanaClient.createConnection(config.rpcUrl);
  const paymentService = createPaymentService();

  const decision = await runSchedulerCycle({
    getTreasuryState: () =>
      buildTreasuryState(
        connection,
        config.treasuryWallet,
        () => paymentService.summarizePendingPayments(),
      ),
    paymentService,
    minLiquidUsdc: MIN_LIQUID_USDC,
  });

  const s = decision.stateSnapshot;
  console.log('StableDesk — Scheduler Cycle (dry-run)');
  console.log(`Treasury:         ${s.treasuryWallet}`);
  console.log(`SOL Balance:      ${s.solBalance} SOL`);
  console.log(`USDC Balance:     ${s.usdcBalance} USDC`);
  console.log(`Target Liquidity: ${decision.targetLiquidity} USDC`);
  console.log(`Excess:           ${decision.excessLiquidity} USDC`);
  console.log(`Shortfall:        ${decision.liquidityShortfall} USDC`);
  console.log(`Pending Payments: ${s.pendingPaymentsCount} ($${s.pendingPaymentsTotal} USDC)`);
  console.log(`Actions:          ${decision.actions.join(', ')}`);
};

runScheduler().catch((err: unknown) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
