import type { Connection } from '@solana/web3.js';
import { solanaClient } from '../integrations/solana.js';
import { fetchAllStablecoinBalances } from '../integrations/usdc.js';

export type TreasuryState = {
  treasuryWallet: string;
  solBalance: number;
  usdcBalance: number;
  kaminoUsdcBalance: number;    // USDC deployed in Kamino vault
  totalUsdcExposure: number;    // usdcBalance + kaminoUsdcBalance
  pendingPaymentsCount: number;
  pendingPaymentsTotal: number;
  lastUpdatedAt: string;
  tokenBalances: Record<string, number>;
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
  getPendingPayments: () => PendingPaymentsSummary = defaultPendingPayments,
  getKaminoUsdcBalance: () => Promise<number> = defaultKaminoBalance,
): Promise<TreasuryState> {
  const [solBalance, tokenBalances, kaminoUsdcBalance] = await Promise.all([
    solanaClient.getSolBalance(connection, treasuryWallet),
    fetchAllStablecoinBalances(connection, treasuryWallet),
    getKaminoUsdcBalance(),
  ]);

  const pending = getPendingPayments();
  const usdcBalance = tokenBalances['USDC'] ?? 0;

  return {
    treasuryWallet,
    solBalance,
    usdcBalance,
    kaminoUsdcBalance,
    totalUsdcExposure: usdcBalance + kaminoUsdcBalance,
    pendingPaymentsCount: pending.count,
    pendingPaymentsTotal: pending.total,
    lastUpdatedAt: new Date().toISOString(),
    tokenBalances,
  };
}

export function emptyState(): TreasuryState {
  return {
    treasuryWallet: '',
    solBalance: 0,
    usdcBalance: 0,
    kaminoUsdcBalance: 0,
    totalUsdcExposure: 0,
    pendingPaymentsCount: 0,
    pendingPaymentsTotal: 0,
    lastUpdatedAt: new Date().toISOString(),
    tokenBalances: {},
  };
}
