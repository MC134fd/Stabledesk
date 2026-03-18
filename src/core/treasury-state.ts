import type { LendingPosition, ProtocolId } from "../integrations/lending/types.js";

/** Balance of a single stablecoin in the treasury wallet */
export interface TokenBalance {
  symbol: string;
  mint: string;
  /** Liquid (wallet) balance in smallest unit */
  liquid: bigint;
  /** Total deposited across all lending protocols */
  deployed: bigint;
  /** Breakdown by protocol */
  deployedByProtocol: Map<ProtocolId, bigint>;
}

export interface TreasuryState {
  /** Per-token balances (liquid + deployed) */
  balances: Map<string, TokenBalance>;
  /** All lending positions across all protocols */
  lendingPositions: LendingPosition[];
  /** Aggregate: total liquid across all tokens (micro-USDC equivalent) */
  totalLiquid: bigint;
  /** Aggregate: total deployed across all protocols/tokens */
  totalDeployed: bigint;
  /** Aggregate: total AUM */
  totalAum: bigint;
  /** Pending outgoing payment obligations (micro-USDC) */
  pendingObligations: bigint;
  /** Last Solana slot when state was fetched */
  lastUpdatedSlot: number;
  /** ISO timestamp of last refresh */
  lastUpdatedAt: string;

  // Legacy accessors for backward compatibility
  /** @deprecated Use balances.get("USDC")?.liquid */
  liquidUsdc: bigint;
  /** @deprecated Use totalDeployed */
  kaminoDeposited: bigint;
  /** @deprecated Use totalAum */
  totalUsdc: bigint;
}

export function emptyState(): TreasuryState {
  return {
    balances: new Map(),
    lendingPositions: [],
    totalLiquid: 0n,
    totalDeployed: 0n,
    totalAum: 0n,
    pendingObligations: 0n,
    lastUpdatedSlot: 0,
    lastUpdatedAt: new Date().toISOString(),
    // Legacy
    liquidUsdc: 0n,
    kaminoDeposited: 0n,
    totalUsdc: 0n,
  };
}

/** Build state from liquid balances + lending positions */
export function buildState(
  liquidBalances: Map<string, { symbol: string; mint: string; amount: bigint }>,
  lendingPositions: LendingPosition[],
  pendingObligations: bigint,
  slot: number,
): TreasuryState {
  const balances = new Map<string, TokenBalance>();
  let totalLiquid = 0n;
  let totalDeployed = 0n;

  // Initialize from liquid balances
  for (const [symbol, bal] of liquidBalances) {
    balances.set(symbol, {
      symbol: bal.symbol,
      mint: bal.mint,
      liquid: bal.amount,
      deployed: 0n,
      deployedByProtocol: new Map(),
    });
    totalLiquid += bal.amount;
  }

  // Add lending positions
  for (const pos of lendingPositions) {
    let tokenBal = balances.get(pos.token);
    if (!tokenBal) {
      tokenBal = {
        symbol: pos.token,
        mint: pos.mint,
        liquid: 0n,
        deployed: 0n,
        deployedByProtocol: new Map(),
      };
      balances.set(pos.token, tokenBal);
    }
    tokenBal.deployed += pos.depositedAmount;
    const existing = tokenBal.deployedByProtocol.get(pos.protocol) ?? 0n;
    tokenBal.deployedByProtocol.set(pos.protocol, existing + pos.depositedAmount);
    totalDeployed += pos.depositedAmount;
  }

  const totalAum = totalLiquid + totalDeployed;
  const usdcLiquid = balances.get("USDC")?.liquid ?? 0n;

  // Compute Kamino-only deposited total for legacy field accuracy
  let kaminoOnly = 0n;
  for (const pos of lendingPositions) {
    if (pos.protocol === "kamino") kaminoOnly += pos.depositedAmount;
  }

  return {
    balances,
    lendingPositions,
    totalLiquid,
    totalDeployed,
    totalAum,
    pendingObligations,
    lastUpdatedSlot: slot,
    lastUpdatedAt: new Date().toISOString(),
    // Legacy
    liquidUsdc: usdcLiquid,
    kaminoDeposited: kaminoOnly,
    totalUsdc: totalAum,
  };
}
