import type { TreasuryState } from "./treasury-state.js";
import type { TreasuryPolicy } from "../config/policy.js";

export type RebalanceAction =
  | { type: "deposit"; amountUsdc: bigint; token: string }
  | { type: "withdraw"; amountUsdc: bigint; token: string }
  | { type: "none" };

export interface PolicyDecision {
  rebalance: RebalanceAction;
  canProcessPayments: boolean;
  availableForPayments: bigint;
  reason: string;
}

/**
 * Evaluate the treasury policy using aggregate multi-token totals.
 *
 * - totalLiquid: sum of all stablecoin wallet balances
 * - totalDeployed: sum of all lending positions across all protocols
 * - totalAum: totalLiquid + totalDeployed
 *
 * The policy field `kaminoTargetAllocationPct` is interpreted as the
 * target % of AUM deployed to lending (any protocol, any token).
 */
export function evaluatePolicy(state: TreasuryState, policy: TreasuryPolicy): PolicyDecision {
  const { totalLiquid, totalDeployed, totalAum } = state;

  // Determine which token has the most liquid balance (for rebalancing target)
  let rebalanceToken = "USDC";
  let maxLiquid = 0n;
  for (const [symbol, bal] of state.balances) {
    if (bal.liquid > maxLiquid) {
      maxLiquid = bal.liquid;
      rebalanceToken = symbol;
    }
  }

  // If below minimum liquid reserve, must withdraw from lending
  if (totalLiquid < policy.minLiquidReserveUsdc) {
    const deficit = policy.targetLiquidReserveUsdc - totalLiquid;
    const withdrawAmount = deficit > totalDeployed ? totalDeployed : deficit;

    if (withdrawAmount > 0n) {
      // Withdraw into the token with the most deployed capital
      let withdrawToken = "USDC";
      let maxDeployed = 0n;
      for (const [symbol, bal] of state.balances) {
        if (bal.deployed > maxDeployed) {
          maxDeployed = bal.deployed;
          withdrawToken = symbol;
        }
      }

      return {
        rebalance: { type: "withdraw", amountUsdc: withdrawAmount, token: withdrawToken },
        canProcessPayments: false,
        availableForPayments: 0n,
        reason: `Liquid balance (${fmtUsdc(totalLiquid)}) below minimum (${fmtUsdc(policy.minLiquidReserveUsdc)}). Withdrawing ${fmtUsdc(withdrawAmount)} ${withdrawToken} from lending.`,
      };
    }

    return {
      rebalance: { type: "none" },
      canProcessPayments: false,
      availableForPayments: 0n,
      reason: `Liquid balance below minimum and no lending balance to withdraw.`,
    };
  }

  // Check if we should deposit excess into lending
  const targetDeployed = (totalAum * BigInt(policy.kaminoTargetAllocationPct)) / 100n;
  const excessLiquid = totalLiquid - policy.targetLiquidReserveUsdc;

  if (excessLiquid > 0n && totalDeployed < targetDeployed) {
    const depositGap = targetDeployed - totalDeployed;
    const depositAmount = excessLiquid < depositGap ? excessLiquid : depositGap;

    if (depositAmount > 1_000_000n) { // only deposit if > 1 USDC to avoid dust
      return {
        rebalance: { type: "deposit", amountUsdc: depositAmount, token: rebalanceToken },
        canProcessPayments: true,
        availableForPayments: totalLiquid - policy.minLiquidReserveUsdc - state.pendingObligations,
        reason: `Excess liquid balance. Depositing ${fmtUsdc(depositAmount)} ${rebalanceToken} to lending (target ${policy.kaminoTargetAllocationPct}%).`,
      };
    }
  }

  const available = totalLiquid - policy.minLiquidReserveUsdc - state.pendingObligations;

  return {
    rebalance: { type: "none" },
    canProcessPayments: available > 0n,
    availableForPayments: available > 0n ? available : 0n,
    reason: `Treasury healthy. ${fmtUsdc(available > 0n ? available : 0n)} available for payments.`,
  };
}

export function canApprovePayment(
  amountUsdc: bigint,
  state: TreasuryState,
  policy: TreasuryPolicy,
): { approved: boolean; reason: string } {
  if (amountUsdc > policy.maxSingleTransactionUsdc) {
    return { approved: false, reason: `Amount exceeds max single transaction (${fmtUsdc(policy.maxSingleTransactionUsdc)})` };
  }

  const availableLiquidity = state.totalLiquid - policy.minLiquidReserveUsdc - state.pendingObligations;
  if (amountUsdc > availableLiquidity) {
    return { approved: false, reason: `Insufficient liquidity. Available: ${fmtUsdc(availableLiquidity)}, requested: ${fmtUsdc(amountUsdc)}` };
  }

  return { approved: true, reason: "Payment approved" };
}

/** Format micro-USDC as human-readable string */
function fmtUsdc(microUsdc: bigint): string {
  if (microUsdc < 0n) return "-" + fmtUsdc(-microUsdc);
  const whole = microUsdc / 1_000_000n;
  const frac = microUsdc % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, "0")} USDC`;
}

export { fmtUsdc };
