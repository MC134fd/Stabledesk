// Milestone 3: pure liquidity policy math — no network calls, no side effects

export type LiquidityAction = 'deposit' | 'withdraw' | 'none';

export type LiquidityPolicyInput = {
  minLiquidUsdc: number;
  pendingPaymentsTotal: number;
  currentLiquidUsdc: number;
};

export type LiquidityEvaluation = {
  targetLiquidity: number;
  excessLiquidity: number;
  liquidityShortfall: number;
  action: LiquidityAction;
};

function safe(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function computeTargetLiquidity(minLiquidUsdc: number, pendingPaymentsTotal: number): number {
  return safe(minLiquidUsdc) + safe(pendingPaymentsTotal);
}

export function computeExcessLiquidity(currentLiquidUsdc: number, targetLiquidity: number): number {
  return Math.max(safe(currentLiquidUsdc) - safe(targetLiquidity), 0);
}

export function computeLiquidityShortfall(currentLiquidUsdc: number, targetLiquidity: number): number {
  return Math.max(safe(targetLiquidity) - safe(currentLiquidUsdc), 0);
}

export function evaluateLiquidityPolicy(input: LiquidityPolicyInput): LiquidityEvaluation {
  const targetLiquidity = computeTargetLiquidity(input.minLiquidUsdc, input.pendingPaymentsTotal);
  const excessLiquidity = computeExcessLiquidity(input.currentLiquidUsdc, targetLiquidity);
  const liquidityShortfall = computeLiquidityShortfall(input.currentLiquidUsdc, targetLiquidity);

  let action: LiquidityAction;
  if (excessLiquidity > 0) action = 'deposit';
  else if (liquidityShortfall > 0) action = 'withdraw';
  else action = 'none';

  return { targetLiquidity, excessLiquidity, liquidityShortfall, action };
}
