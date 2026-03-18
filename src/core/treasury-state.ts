export interface TreasuryState {
  /** Liquid USDC in the treasury wallet (micro-USDC) */
  liquidUsdc: bigint;
  /** USDC deposited into Kamino (micro-USDC, includes accrued yield) */
  kaminoDeposited: bigint;
  /** Total USDC under management */
  totalUsdc: bigint;
  /** Pending outgoing payment obligations (micro-USDC) */
  pendingObligations: bigint;
  /** Last Solana slot when state was fetched */
  lastUpdatedSlot: number;
  /** ISO timestamp of last refresh */
  lastUpdatedAt: string;
}

export function emptyState(): TreasuryState {
  return {
    liquidUsdc: 0n,
    kaminoDeposited: 0n,
    totalUsdc: 0n,
    pendingObligations: 0n,
    lastUpdatedSlot: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
}
