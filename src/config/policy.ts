export interface TreasuryPolicy {
  /** Minimum USDC to keep liquid (micro-USDC, 6 decimals). Below this, withdraw from Kamino. */
  minLiquidReserveUsdc: bigint;
  /** Target liquid USDC. Rebalancing aims for this level. */
  targetLiquidReserveUsdc: bigint;
  /** Max single outgoing transaction size (micro-USDC). */
  maxSingleTransactionUsdc: bigint;
  /** Target % of total USDC deployed to Kamino (0-100). */
  kaminoTargetAllocationPct: number;
  /** Daily spending cap (micro-USDC). 0 = unlimited. */
  dailySpendingCapUsdc: bigint;
  /** Addresses that must never receive funds. */
  disallowedRecipients: string[];
}

/** Sensible defaults for a conservative treasury policy. */
export const defaultPolicy: TreasuryPolicy = {
  minLiquidReserveUsdc: 1_000_000n,            // 1 USDC
  targetLiquidReserveUsdc: 2_000_000n,         // 2 USDC
  maxSingleTransactionUsdc: 1_000_000_000n,    // 1,000 USDC
  kaminoTargetAllocationPct: 50,
  dailySpendingCapUsdc: 0n,                    // unlimited
  disallowedRecipients: [],
};
