import type { Connection } from '@solana/web3.js';
import { solanaClient } from '../integrations/solana.js';
import { usdcClient } from '../integrations/usdc.js';

export type TreasuryState = {
  treasuryWallet: string;
  solBalance: number;
  usdcBalance: number;
  pendingPaymentsCount: number;
  pendingPaymentsTotal: number;
  lastUpdatedAt: string;
};

export type PendingPaymentsSummary = {
  count: number;
  total: number;
};

const defaultPendingPayments = (): PendingPaymentsSummary => ({ count: 0, total: 0 });

export async function buildTreasuryState(
  connection: Connection,
  treasuryWallet: string,
  usdcMint: string,
  getPendingPayments: () => PendingPaymentsSummary = defaultPendingPayments,
): Promise<TreasuryState> {
  const [solBalance, usdcResult] = await Promise.all([
    solanaClient.getSolBalance(connection, treasuryWallet),
    usdcClient.getBalance(connection, treasuryWallet, usdcMint),
  ]);

  const pending = getPendingPayments();

  return {
    treasuryWallet,
    solBalance,
    usdcBalance: usdcResult.uiAmount,
    pendingPaymentsCount: pending.count,
    pendingPaymentsTotal: pending.total,
    lastUpdatedAt: new Date().toISOString(),
  };
}
