import type { TreasuryState } from "./treasury-state.js";
import type { TreasuryPolicy } from "../config/policy.js";

export type RebalanceAction =
  | { type: "deposit"; amountUsdc: bigint }
  | { type: "withdraw"; amountUsdc: bigint }
  | { type: "none" };

export interface PolicyDecision {
  rebalance: RebalanceAction;
  canProcessPayments: boolean;
  availableForPayments: bigint;
  reason: string;
}

export function evaluatePolicy(state: TreasuryState, policy: TreasuryPolicy): PolicyDecision {
  const { liquidUsdc, totalUsdc, kaminoDeposited } = state;

  // If below minimum liquid reserve, must withdraw from Kamino
  if (liquidUsdc < policy.minLiquidReserveUsdc) {
    const deficit = policy.targetLiquidReserveUsdc - liquidUsdc;
    const withdrawAmount = deficit > kaminoDeposited ? kaminoDeposited : deficit;

    if (withdrawAmount > 0n) {
      return {
        rebalance: { type: "withdraw", amountUsdc: withdrawAmount },
        canProcessPayments: false,
        availableForPayments: 0n,
        reason: `Liquid USDC (${fmtUsdc(liquidUsdc)}) below minimum (${fmtUsdc(policy.minLiquidReserveUsdc)}). Withdrawing ${fmtUsdc(withdrawAmount)} from Kamino.`,
      };
    }

    return {
      rebalance: { type: "none" },
      canProcessPayments: false,
      availableForPayments: 0n,
      reason: `Liquid USDC below minimum and no Kamino balance to withdraw.`,
    };
  }

  // Check if we should deposit excess into Kamino
  const targetKamino = (totalUsdc * BigInt(policy.kaminoTargetAllocationPct)) / 100n;
  const excessLiquid = liquidUsdc - policy.targetLiquidReserveUsdc;

  if (excessLiquid > 0n && kaminoDeposited < targetKamino) {
    const depositGap = targetKamino - kaminoDeposited;
    const depositAmount = excessLiquid < depositGap ? excessLiquid : depositGap;

    if (depositAmount > 1_000_000n) { // only deposit if > 1 USDC to avoid dust
      return {
        rebalance: { type: "deposit", amountUsdc: depositAmount },
        canProcessPayments: true,
        availableForPayments: liquidUsdc - policy.minLiquidReserveUsdc - state.pendingObligations,
        reason: `Excess liquid USDC. Depositing ${fmtUsdc(depositAmount)} to Kamino (target ${policy.kaminoTargetAllocationPct}%).`,
      };
    }
  }

  const available = liquidUsdc - policy.minLiquidReserveUsdc - state.pendingObligations;

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

  const availableLiquidity = state.liquidUsdc - policy.minLiquidReserveUsdc - state.pendingObligations;
  if (amountUsdc > availableLiquidity) {
    return { approved: false, reason: `Insufficient liquidity. Available: ${fmtUsdc(availableLiquidity)}, requested: ${fmtUsdc(amountUsdc)}` };
  }

  return { approved: true, reason: "Payment approved" };
}

/** Format micro-USDC as human-readable string */
function fmtUsdc(microUsdc: bigint): string {
  const whole = microUsdc / 1_000_000n;
  const frac = microUsdc % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, "0")} USDC`;
}

export { fmtUsdc };
