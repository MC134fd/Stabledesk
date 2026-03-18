import { describe, it, expect } from 'vitest';
import {
  computeTargetLiquidity,
  computeExcessLiquidity,
  computeLiquidityShortfall,
  evaluateLiquidityPolicy,
} from '../../src/core/liquidity-policy.js';

describe('computeTargetLiquidity', () => {
  it('computes target liquidity correctly', () => {
    expect(computeTargetLiquidity(1000, 500)).toBe(1500);
  });

  it('pending payments increase target liquidity', () => {
    const base = computeTargetLiquidity(1000, 0);
    const withPending = computeTargetLiquidity(1000, 200);
    expect(withPending).toBe(base + 200);
  });

  it('negative inputs normalized to 0', () => {
    expect(computeTargetLiquidity(-500, -200)).toBe(0);
  });

  it('NaN inputs normalized to 0', () => {
    expect(computeTargetLiquidity(NaN, NaN)).toBe(0);
  });

  it('Infinity inputs normalized to 0', () => {
    expect(computeTargetLiquidity(Infinity, Infinity)).toBe(0);
  });
});

describe('computeExcessLiquidity', () => {
  it('computes excess liquidity correctly', () => {
    expect(computeExcessLiquidity(2000, 1000)).toBe(1000);
  });

  it('returns 0 when current is below target (no negative excess)', () => {
    expect(computeExcessLiquidity(500, 1000)).toBe(0);
  });

  it('exact-threshold balance => excess is 0', () => {
    expect(computeExcessLiquidity(1000, 1000)).toBe(0);
  });

  it('NaN inputs normalized to 0', () => {
    expect(computeExcessLiquidity(NaN, NaN)).toBe(0);
  });

  it('negative inputs normalized to 0', () => {
    expect(computeExcessLiquidity(-100, -200)).toBe(0);
  });
});

describe('computeLiquidityShortfall', () => {
  it('computes liquidity shortfall correctly', () => {
    expect(computeLiquidityShortfall(500, 1000)).toBe(500);
  });

  it('returns 0 when current meets or exceeds target', () => {
    expect(computeLiquidityShortfall(1500, 1000)).toBe(0);
  });

  it('exact-threshold balance => shortfall is 0', () => {
    expect(computeLiquidityShortfall(1000, 1000)).toBe(0);
  });

  it('NaN inputs normalized to 0', () => {
    expect(computeLiquidityShortfall(NaN, NaN)).toBe(0);
  });

  it('negative inputs normalized to 0', () => {
    expect(computeLiquidityShortfall(-100, -200)).toBe(0);
  });
});

describe('evaluateLiquidityPolicy', () => {
  it('action is "deposit" when excess exists', () => {
    const result = evaluateLiquidityPolicy({
      minLiquidUsdc: 1000,
      pendingPaymentsTotal: 0,
      currentLiquidUsdc: 2000,
    });
    expect(result.action).toBe('deposit');
    expect(result.excessLiquidity).toBe(1000);
    expect(result.liquidityShortfall).toBe(0);
  });

  it('action is "withdraw" when shortfall exists', () => {
    const result = evaluateLiquidityPolicy({
      minLiquidUsdc: 1000,
      pendingPaymentsTotal: 500,
      currentLiquidUsdc: 200,
    });
    expect(result.action).toBe('withdraw');
    expect(result.liquidityShortfall).toBe(1300);
    expect(result.excessLiquidity).toBe(0);
  });

  it('exact-threshold balance => excess 0, shortfall 0, action "none"', () => {
    const result = evaluateLiquidityPolicy({
      minLiquidUsdc: 1000,
      pendingPaymentsTotal: 500,
      currentLiquidUsdc: 1500,
    });
    expect(result.action).toBe('none');
    expect(result.excessLiquidity).toBe(0);
    expect(result.liquidityShortfall).toBe(0);
  });

  it('zero balances handled safely', () => {
    const result = evaluateLiquidityPolicy({
      minLiquidUsdc: 0,
      pendingPaymentsTotal: 0,
      currentLiquidUsdc: 0,
    });
    expect(result.targetLiquidity).toBe(0);
    expect(result.excessLiquidity).toBe(0);
    expect(result.liquidityShortfall).toBe(0);
    expect(result.action).toBe('none');
  });

  it('negative inputs normalized to 0', () => {
    const result = evaluateLiquidityPolicy({
      minLiquidUsdc: -500,
      pendingPaymentsTotal: -200,
      currentLiquidUsdc: -100,
    });
    expect(result.targetLiquidity).toBe(0);
    expect(result.excessLiquidity).toBe(0);
    expect(result.liquidityShortfall).toBe(0);
  });

  it('NaN/Infinity inputs normalized to 0', () => {
    const result = evaluateLiquidityPolicy({
      minLiquidUsdc: NaN,
      pendingPaymentsTotal: Infinity,
      currentLiquidUsdc: -Infinity,
    });
    expect(result.targetLiquidity).toBe(0);
    expect(result.excessLiquidity).toBe(0);
    expect(result.liquidityShortfall).toBe(0);
    expect(result.action).toBe('none');
  });
});
