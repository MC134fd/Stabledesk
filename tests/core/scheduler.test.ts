import { describe, it, expect } from 'vitest';
import { runSchedulerCycle, type SchedulerCycleDeps } from '../../src/core/scheduler.js';
import { createPaymentService } from '../../src/payments/payment-service.js';
import { createKaminoClient } from '../../src/integrations/kamino.js';
import { createAuditService } from '../../src/audit/audit-service.js';
import type { TreasuryState } from '../../src/core/treasury-state.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(usdcBalance: number, kaminoBalance = 0): TreasuryState {
  return {
    treasuryWallet: '11111111111111111111111111111111',
    solBalance: 1,
    usdcBalance,
    kaminoUsdcBalance: kaminoBalance,
    totalUsdcExposure: usdcBalance + kaminoBalance,
    pendingPaymentsCount: 0,
    pendingPaymentsTotal: 0,
    lastUpdatedAt: '2024-01-01T00:00:00.000Z',
  };
}

let _n = 0;
function makeService() {
  return createPaymentService(undefined, {
    now: () => '2024-01-01T00:00:00.000Z',
    generateId: () => `pay_${++_n}`,
  });
}

let _a = 0;
function makeAudit() {
  return createAuditService({
    now: () => '2024-01-01T00:00:00.000Z',
    generateId: () => `audit_${++_a}`,
  });
}

function makeKamino(depositedUsdc = 5000) {
  return createKaminoClient({
    handlers: {
      getPosition: async () => ({
        vaultId: 'test-vault',
        depositedUsdc,
        accruedYieldUsdc: 0,
        totalUsdc: depositedUsdc,
        updatedAt: '2024-01-01T00:00:00.000Z',
      }),
      deposit: async (amount) => ({ ok: true as const, amountUsdc: amount, txId: 'tx-dep' }),
      withdraw: async (amount) => ({ ok: true as const, amountUsdc: amount, txId: 'tx-wit' }),
    },
  });
}

function makeDeps(
  usdcBalance: number,
  minLiquidUsdc: number,
  svc = makeService(),
  kaminoBalance = 0,
): SchedulerCycleDeps {
  return {
    getTreasuryState: () => makeState(usdcBalance, kaminoBalance),
    paymentService: svc,
    minLiquidUsdc,
  };
}

// ---------------------------------------------------------------------------
// Milestone 5 tests — all preserved, unchanged behaviour
// ---------------------------------------------------------------------------
describe('runSchedulerCycle — no_action', () => {
  it('returns no_action when balance equals target and no pending payments', async () => {
    const result = await runSchedulerCycle(makeDeps(1000, 1000));
    expect(result.actions).toEqual(['no_action']);
    expect(result.excessLiquidity).toBe(0);
    expect(result.liquidityShortfall).toBe(0);
  });

  it('does not crash on an empty payment store', async () => {
    await expect(runSchedulerCycle(makeDeps(0, 0))).resolves.toBeDefined();
  });
});

describe('runSchedulerCycle — awaiting_liquidity', () => {
  it('marks a queued payment as awaiting_liquidity when shortfall exists', async () => {
    const svc = makeService();
    const p = svc.createPayment({ recipient: 'Bob', amountUsdc: 800 });
    await runSchedulerCycle(makeDeps(100, 500, svc));
    expect(svc.getPayment(p.id)?.status).toBe('awaiting_liquidity');
  });

  it('includes would_withdraw (not would_deposit) when shortfall with pending payments', async () => {
    const svc = makeService();
    svc.createPayment({ recipient: 'Bob', amountUsdc: 500 });
    const result = await runSchedulerCycle(makeDeps(100, 500, svc));
    expect(result.actions).toContain('would_withdraw');
    expect(result.actions).not.toContain('would_deposit');
  });
});

describe('runSchedulerCycle — ready payments', () => {
  it('marks a queued payment as ready when liquidity is sufficient', async () => {
    const svc = makeService();
    const p = svc.createPayment({ recipient: 'Alice', amountUsdc: 200 });
    await runSchedulerCycle(makeDeps(2000, 1000, svc));
    expect(svc.getPayment(p.id)?.status).toBe('ready');
  });

  it('promotes an awaiting_liquidity payment to ready when liquidity recovers', async () => {
    const svc = makeService();
    const p = svc.createPayment({ recipient: 'Alice', amountUsdc: 200 });
    await runSchedulerCycle(makeDeps(50, 1000, svc));
    expect(svc.getPayment(p.id)?.status).toBe('awaiting_liquidity');
    await runSchedulerCycle(makeDeps(2000, 1000, svc));
    expect(svc.getPayment(p.id)?.status).toBe('ready');
  });

  it('includes would_execute_payment when payments are (or become) ready', async () => {
    const svc = makeService();
    svc.createPayment({ recipient: 'Alice', amountUsdc: 200 });
    const result = await runSchedulerCycle(makeDeps(2000, 1000, svc));
    expect(result.actions).toContain('would_execute_payment');
  });
});

describe('runSchedulerCycle — deposit signaling', () => {
  it('includes would_deposit when excess liquidity exists and no pending payments', async () => {
    const result = await runSchedulerCycle(makeDeps(5000, 1000));
    expect(result.actions).toContain('would_deposit');
    expect(result.excessLiquidity).toBe(4000);
  });

  it('prioritizes withdraw over deposit — no would_deposit when shortfall exists', async () => {
    const svc = makeService();
    svc.createPayment({ recipient: 'Bob', amountUsdc: 500 });
    const result = await runSchedulerCycle(makeDeps(800, 500, svc));
    expect(result.actions).toContain('would_withdraw');
    expect(result.actions).not.toContain('would_deposit');
    expect(result.actions).not.toContain('would_execute_payment');
  });
});

describe('runSchedulerCycle — actions deduplication and order', () => {
  it('actions list has no duplicates', async () => {
    const svc = makeService();
    svc.createPayment({ recipient: 'Alice', amountUsdc: 200 });
    const result = await runSchedulerCycle(makeDeps(3000, 1000, svc));
    const unique = new Set(result.actions);
    expect(unique.size).toBe(result.actions.length);
  });

  it('stable order: would_execute_payment before would_deposit', async () => {
    const svc = makeService();
    svc.createPayment({ recipient: 'Alice', amountUsdc: 200 });
    const result = await runSchedulerCycle(makeDeps(5000, 1000, svc));
    expect(result.actions).toContain('would_execute_payment');
    expect(result.actions).toContain('would_deposit');
    expect(result.actions.indexOf('would_execute_payment')).toBeLessThan(
      result.actions.indexOf('would_deposit'),
    );
  });
});

// ---------------------------------------------------------------------------
// Milestone 6 — audit and Kamino execution tests
// ---------------------------------------------------------------------------
describe('runSchedulerCycle — audit events', () => {
  it('emits scheduler_decision audit event each cycle', async () => {
    const audit = makeAudit();
    await runSchedulerCycle({ ...makeDeps(1000, 1000), auditService: audit });
    const decisions = audit.queryEvents({ type: 'scheduler_decision' });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.data).toMatchObject({ actions: ['no_action'] });
  });

  it('emits scheduler_decision with correct action list', async () => {
    const audit = makeAudit();
    await runSchedulerCycle({ ...makeDeps(5000, 1000), auditService: audit });
    const event = audit.queryEvents({ type: 'scheduler_decision' })[0]!;
    expect((event.data as { actions: string[] }).actions).toContain('would_deposit');
  });
});

describe('runSchedulerCycle — Kamino withdraw (execute mode)', () => {
  it('emits withdraw attempt + success audit events when shortfall exists and Kamino has funds', async () => {
    const svc = makeService();
    svc.createPayment({ recipient: 'Bob', amountUsdc: 800 });
    const audit = makeAudit();
    const kamino = makeKamino(5000);
    // usdcBalance=100, minLiquid=500, pending=800 → shortfall=1200; kaminoBalance=5000
    await runSchedulerCycle({
      getTreasuryState: () => makeState(100, 5000),
      paymentService: svc,
      minLiquidUsdc: 500,
      kaminoClient: kamino,
      auditService: audit,
      executionMode: 'execute',
    });
    expect(audit.queryEvents({ type: 'kamino_withdraw_attempt' })).toHaveLength(1);
    expect(audit.queryEvents({ type: 'kamino_withdraw_success' })).toHaveLength(1);
  });

  it('withdraw amount is capped at kaminoUsdcBalance', async () => {
    const svc = makeService();
    svc.createPayment({ recipient: 'Bob', amountUsdc: 2000 });
    const audit = makeAudit();
    const kamino = makeKamino(300); // only 300 available to withdraw
    await runSchedulerCycle({
      getTreasuryState: () => makeState(100, 300),
      paymentService: svc,
      minLiquidUsdc: 500,
      kaminoClient: kamino,
      auditService: audit,
      executionMode: 'execute',
    });
    const attempt = audit.queryEvents({ type: 'kamino_withdraw_attempt' })[0]!;
    expect((attempt.data as { withdrawAmount: number }).withdrawAmount).toBe(300);
  });

  it('does not attempt withdraw when kaminoUsdcBalance is 0', async () => {
    const svc = makeService();
    svc.createPayment({ recipient: 'Bob', amountUsdc: 500 });
    const audit = makeAudit();
    // kaminoBalance = 0 (default) — withdraw amount = min(shortfall, 0) = 0
    await runSchedulerCycle({
      ...makeDeps(100, 500, svc, 0),
      kaminoClient: makeKamino(0),
      auditService: audit,
      executionMode: 'execute',
    });
    expect(audit.queryEvents({ type: 'kamino_withdraw_attempt' })).toHaveLength(0);
  });
});

describe('runSchedulerCycle — Kamino deposit (execute mode)', () => {
  it('emits deposit attempt + success audit events when excess exists', async () => {
    const audit = makeAudit();
    const kamino = makeKamino();
    await runSchedulerCycle({
      getTreasuryState: () => makeState(5000),
      paymentService: makeService(),
      minLiquidUsdc: 1000,
      kaminoClient: kamino,
      auditService: audit,
      executionMode: 'execute',
    });
    expect(audit.queryEvents({ type: 'kamino_deposit_attempt' })).toHaveLength(1);
    expect(audit.queryEvents({ type: 'kamino_deposit_success' })).toHaveLength(1);
  });

  it('deposit amount equals excessLiquidity', async () => {
    const audit = makeAudit();
    const kamino = makeKamino();
    // usdcBalance=5000, minLiquid=1000, no pending → target=1000, excess=4000
    await runSchedulerCycle({
      getTreasuryState: () => makeState(5000),
      paymentService: makeService(),
      minLiquidUsdc: 1000,
      kaminoClient: kamino,
      auditService: audit,
      executionMode: 'execute',
    });
    const attempt = audit.queryEvents({ type: 'kamino_deposit_attempt' })[0]!;
    expect((attempt.data as { depositAmount: number }).depositAmount).toBe(4000);
  });
});

describe('runSchedulerCycle — dry_run mode', () => {
  it('does not call Kamino in dry_run mode (default)', async () => {
    const audit = makeAudit();
    const kamino = makeKamino();
    // excess exists — would trigger deposit in execute mode
    await runSchedulerCycle({
      getTreasuryState: () => makeState(5000),
      paymentService: makeService(),
      minLiquidUsdc: 1000,
      kaminoClient: kamino,
      auditService: audit,
      // executionMode not set → defaults to 'dry_run'
    });
    expect(audit.queryEvents({ type: 'kamino_deposit_attempt' })).toHaveLength(0);
    expect(audit.queryEvents({ type: 'kamino_withdraw_attempt' })).toHaveLength(0);
    // but scheduler_decision IS still recorded
    expect(audit.queryEvents({ type: 'scheduler_decision' })).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Milestone 6 — failure paths
// ---------------------------------------------------------------------------
describe('runSchedulerCycle — Kamino failure audit events', () => {
  function makeFailingKamino() {
    return createKaminoClient({
      handlers: {
        withdraw: async () => { throw new Error('RPC timeout on withdraw'); },
        deposit:  async () => { throw new Error('RPC timeout on deposit'); },
      },
    });
  }

  it('records kamino_withdraw_failure when withdraw handler throws', async () => {
    const svc = makeService();
    svc.createPayment({ recipient: 'Bob', amountUsdc: 500 });
    const audit = makeAudit();
    // usdcBalance=100, kaminoBalance=2000 — shortfall exists and Kamino has funds
    await runSchedulerCycle({
      getTreasuryState: () => makeState(100, 2000),
      paymentService: svc,
      minLiquidUsdc: 500,
      kaminoClient: makeFailingKamino(),
      auditService: audit,
      executionMode: 'execute',
    });
    expect(audit.queryEvents({ type: 'kamino_withdraw_attempt' })).toHaveLength(1);
    expect(audit.queryEvents({ type: 'kamino_withdraw_failure' })).toHaveLength(1);
    expect(audit.queryEvents({ type: 'kamino_withdraw_success' })).toHaveLength(0);
  });

  it('records kamino_deposit_failure when deposit handler throws', async () => {
    const audit = makeAudit();
    // excess = 4000 — deposit would fire
    await runSchedulerCycle({
      getTreasuryState: () => makeState(5000),
      paymentService: makeService(),
      minLiquidUsdc: 1000,
      kaminoClient: makeFailingKamino(),
      auditService: audit,
      executionMode: 'execute',
    });
    expect(audit.queryEvents({ type: 'kamino_deposit_attempt' })).toHaveLength(1);
    expect(audit.queryEvents({ type: 'kamino_deposit_failure' })).toHaveLength(1);
    expect(audit.queryEvents({ type: 'kamino_deposit_success' })).toHaveLength(0);
  });

  it('still returns a valid SchedulerDecision even when Kamino throws', async () => {
    const svc = makeService();
    svc.createPayment({ recipient: 'Bob', amountUsdc: 300 });
    const result = await runSchedulerCycle({
      getTreasuryState: () => makeState(100, 2000),
      paymentService: svc,
      minLiquidUsdc: 500,
      kaminoClient: makeFailingKamino(),
      auditService: makeAudit(),
      executionMode: 'execute',
    });
    expect(result).toBeDefined();
    expect(result.actions).toContain('would_withdraw');
  });
});

// ---------------------------------------------------------------------------
describe('runSchedulerCycle — payment status edge cases', () => {
  it('processing payments are NOT re-labeled to awaiting_liquidity on shortfall', async () => {
    const svc = makeService();
    const p = svc.createPayment({ recipient: 'Alice', amountUsdc: 200 });
    // Advance to processing
    svc.updatePaymentStatus(p.id, 'ready');
    svc.updatePaymentStatus(p.id, 'processing');

    // Now run a cycle with shortfall
    await runSchedulerCycle({
      getTreasuryState: () => makeState(0), // severe shortfall
      paymentService: svc,
      minLiquidUsdc: 1000,
    });

    // Must remain processing — not demoted
    expect(svc.getPayment(p.id)?.status).toBe('processing');
  });

  it('multiple pending payments all promoted to ready when liquidity sufficient', async () => {
    const svc = makeService();
    const a = svc.createPayment({ recipient: 'A', amountUsdc: 100 });
    const b = svc.createPayment({ recipient: 'B', amountUsdc: 150 });
    const c = svc.createPayment({ recipient: 'C', amountUsdc: 50 });

    await runSchedulerCycle({
      getTreasuryState: () => makeState(5000),
      paymentService: svc,
      minLiquidUsdc: 1000,
    });

    expect(svc.getPayment(a.id)?.status).toBe('ready');
    expect(svc.getPayment(b.id)?.status).toBe('ready');
    expect(svc.getPayment(c.id)?.status).toBe('ready');
  });

  it('multiple pending payments all marked awaiting_liquidity on shortfall', async () => {
    const svc = makeService();
    const a = svc.createPayment({ recipient: 'A', amountUsdc: 500 });
    const b = svc.createPayment({ recipient: 'B', amountUsdc: 500 });

    await runSchedulerCycle({
      getTreasuryState: () => makeState(100), // far below target
      paymentService: svc,
      minLiquidUsdc: 1000,
    });

    expect(svc.getPayment(a.id)?.status).toBe('awaiting_liquidity');
    expect(svc.getPayment(b.id)?.status).toBe('awaiting_liquidity');
  });
});

// ---------------------------------------------------------------------------
describe('runSchedulerCycle — execute mode without kaminoClient', () => {
  it('runs without error when executionMode is execute but no kaminoClient provided', async () => {
    const svc = makeService();
    svc.createPayment({ recipient: 'Alice', amountUsdc: 200 });
    const result = await runSchedulerCycle({
      getTreasuryState: () => makeState(5000),
      paymentService: svc,
      minLiquidUsdc: 1000,
      executionMode: 'execute', // execute but no kaminoClient
    });
    // No Kamino calls, but decisions and payment status updates still happen
    expect(result.actions).toContain('would_execute_payment');
    expect(result.actions).toContain('would_deposit');
    expect(svc.getPayment(svc.listPayments()[0]!.id)?.status).toBe('ready');
  });
});
