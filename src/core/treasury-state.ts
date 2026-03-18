import type { Connection } from '@solana/web3.js';
import { solanaClient } from '../integrations/solana.js';
import { usdcClient } from '../integrations/usdc.js';

export type TreasuryState = {
  treasuryWallet: string;
  solBalance: number;
  usdcBalance: number;
  kaminoUsdcBalance: number;    // USDC deployed in Kamino vault
  totalUsdcExposure: number;    // usdcBalance + kaminoUsdcBalance
  pendingPaymentsCount: number;
  pendingPaymentsTotal: number;
  lastUpdatedAt: string;
};

export type PendingPaymentsSummary = {
  count: number;
  total: number;
};

const defaultPendingPayments = (): PendingPaymentsSummary => ({ count: 0, total: 0 });
const defaultKaminoBalance = async (): Promise<number> => 0;

export async function buildTreasuryState(
  connection: Connection,
  treasuryWallet: string,
  usdcMint: string,
  getPendingPayments: () => PendingPaymentsSummary = defaultPendingPayments,
  getKaminoUsdcBalance: () => Promise<number> = defaultKaminoBalance,
): Promise<TreasuryState> {
  const [solBalance, usdcResult, kaminoUsdcBalance] = await Promise.all([
    solanaClient.getSolBalance(connection, treasuryWallet),
    usdcClient.getBalance(connection, treasuryWallet, usdcMint),
    getKaminoUsdcBalance(),
  ]);

  const pending = getPendingPayments();

  return {
    treasuryWallet,
    solBalance,
    usdcBalance: usdcResult.uiAmount,
    kaminoUsdcBalance,
    totalUsdcExposure: usdcResult.uiAmount + kaminoUsdcBalance,
    pendingPaymentsCount: pending.count,
    pendingPaymentsTotal: pending.total,
    lastUpdatedAt: new Date().toISOString(),
  };
}
