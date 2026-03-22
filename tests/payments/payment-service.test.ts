import { describe, it, expect } from 'vitest';
import { createPaymentService } from '../../src/payments/payment-service.js';

// Deterministic helpers injected in every test
const fixedOptions = {
  now: () => '2024-01-01T00:00:00.000Z',
  generateId: (() => { let n = 0; return () => `pay_${++n}`; })(),
};

function makeService() {
  // Fresh store + fresh counter per test via closure re-creation
  let n = 0;
  return createPaymentService(undefined, {
    now: () => '2024-01-01T00:00:00.000Z',
    generateId: () => `pay_${++n}`,
  });
}

const validInput = { recipient: 'Alice', amountUsdc: 100 };

// ---------------------------------------------------------------------------
describe('createPayment — happy path', () => {
  it('creates a payment in queued status', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    expect(p.status).toBe('queued');
    expect(p.currency).toBe('USDC');
    expect(p.recipient).toBe('Alice');
    expect(p.amountUsdc).toBe(100);
    expect(p.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
describe('createPayment — validation', () => {
  it('rejects zero amount', () => {
    const svc = makeService();
    expect(() => svc.createPayment({ recipient: 'Alice', amountUsdc: 0 })).toThrow();
  });

  it('rejects negative amount', () => {
    const svc = makeService();
    expect(() => svc.createPayment({ recipient: 'Alice', amountUsdc: -50 })).toThrow();
  });

  it('rejects NaN amount', () => {
    const svc = makeService();
    expect(() => svc.createPayment({ recipient: 'Alice', amountUsdc: NaN })).toThrow();
  });

  it('rejects Infinity amount', () => {
    const svc = makeService();
    expect(() => svc.createPayment({ recipient: 'Alice', amountUsdc: Infinity })).toThrow();
  });

  it('rejects empty recipient', () => {
    const svc = makeService();
    expect(() => svc.createPayment({ recipient: '   ', amountUsdc: 100 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
describe('listPendingPayments', () => {
  it('includes queued, awaiting_liquidity, ready, processing — excludes sent', () => {
    const svc = makeService();
    const a = svc.createPayment({ recipient: 'A', amountUsdc: 10 }); // queued
    const b = svc.createPayment({ recipient: 'B', amountUsdc: 20 }); // queued -> sent

    svc.updatePaymentStatus(b.id, 'ready');
    svc.updatePaymentStatus(b.id, 'processing');
    svc.updatePaymentStatus(b.id, 'sent');

    const pending = svc.listPendingPayments();
    expect(pending.map((p) => p.id)).toContain(a.id);
    expect(pending.map((p) => p.id)).not.toContain(b.id);
  });

  it('processing payments are still included in pending list', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    svc.updatePaymentStatus(p.id, 'ready');
    svc.updatePaymentStatus(p.id, 'processing');

    const pending = svc.listPendingPayments();
    expect(pending.some((x) => x.id === p.id)).toBe(true);
    expect(pending.find((x) => x.id === p.id)?.status).toBe('processing');
  });
});

// ---------------------------------------------------------------------------
describe('updatePaymentStatus', () => {
  it('transitions status correctly for a valid path', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    const updated = svc.updatePaymentStatus(p.id, 'ready');
    expect(updated.status).toBe('ready');
    expect(svc.getPayment(p.id)?.status).toBe('ready');
  });

  it('rejects an invalid status transition', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput); // queued
    // queued -> sent is not allowed
    expect(() => svc.updatePaymentStatus(p.id, 'sent')).toThrow(/Invalid transition/);
  });
});

// ---------------------------------------------------------------------------
describe('summarizePendingPayments', () => {
  it('sums pending payment totals correctly', () => {
    const svc = makeService();
    svc.createPayment({ recipient: 'A', amountUsdc: 100 });
    svc.createPayment({ recipient: 'B', amountUsdc: 250 });

    const summary = svc.summarizePendingPayments();
    expect(summary.count).toBe(2);
    expect(summary.total).toBe(350);
  });

  it('excludes sent payments from the summary', () => {
    const svc = makeService();
    const a = svc.createPayment({ recipient: 'A', amountUsdc: 100 });
    svc.createPayment({ recipient: 'B', amountUsdc: 200 }); // stays queued

    svc.updatePaymentStatus(a.id, 'ready');
    svc.updatePaymentStatus(a.id, 'processing');
    svc.updatePaymentStatus(a.id, 'sent');

    const summary = svc.summarizePendingPayments();
    expect(summary.count).toBe(1);
    expect(summary.total).toBe(200);
  });

  it('includes awaiting_liquidity and ready payments in the summary', () => {
    const svc = makeService();
    const a = svc.createPayment({ recipient: 'A', amountUsdc: 100 }); // queued
    const b = svc.createPayment({ recipient: 'B', amountUsdc: 200 });
    const c = svc.createPayment({ recipient: 'C', amountUsdc: 300 });

    svc.updatePaymentStatus(b.id, 'awaiting_liquidity');
    svc.updatePaymentStatus(c.id, 'ready');

    const summary = svc.summarizePendingPayments();
    expect(summary.count).toBe(3);
    expect(summary.total).toBe(600);
    void a; // all three are pending
  });

  it('returns zero count and total when store is empty', () => {
    const svc = makeService();
    const summary = svc.summarizePendingPayments();
    expect(summary.count).toBe(0);
    expect(summary.total).toBe(0);
  });
});

void fixedOptions; // suppress unused-var warning — available for one-off tests if needed

// ---------------------------------------------------------------------------
describe('createPayment — optional fields', () => {
  it('preserves dueAt when supplied', () => {
    const svc = makeService();
    const p = svc.createPayment({ recipient: 'A', amountUsdc: 50, dueAt: '2024-06-01T00:00:00.000Z' });
    expect(p.dueAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('preserves reference when supplied', () => {
    const svc = makeService();
    const p = svc.createPayment({ recipient: 'A', amountUsdc: 50, reference: 'INV-001' });
    expect(p.reference).toBe('INV-001');
  });

  it('omits dueAt when not supplied', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    expect(p.dueAt).toBeUndefined();
  });

  it('trims leading/trailing whitespace from recipient', () => {
    const svc = makeService();
    const p = svc.createPayment({ recipient: '  Bob  ', amountUsdc: 10 });
    expect(p.recipient).toBe('Bob');
  });
});

// ---------------------------------------------------------------------------
describe('getPayment', () => {
  it('returns the payment for a known id', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    expect(svc.getPayment(p.id)).toMatchObject({ id: p.id, status: 'queued' });
  });

  it('returns undefined for an unknown id', () => {
    const svc = makeService();
    expect(svc.getPayment('does-not-exist')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe('listPayments', () => {
  it('returns all payments regardless of status', () => {
    const svc = makeService();
    const a = svc.createPayment({ recipient: 'A', amountUsdc: 10 });
    const b = svc.createPayment({ recipient: 'B', amountUsdc: 20 });
    svc.updatePaymentStatus(b.id, 'ready');
    svc.updatePaymentStatus(b.id, 'processing');
    svc.updatePaymentStatus(b.id, 'sent');

    const all = svc.listPayments();
    expect(all).toHaveLength(2);
    expect(all.map((p) => p.id)).toContain(a.id);
    expect(all.map((p) => p.id)).toContain(b.id);
  });

  it('returns an empty array when no payments exist', () => {
    const svc = makeService();
    expect(svc.listPayments()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('updatePaymentStatus — error cases', () => {
  it('throws when the payment id does not exist', () => {
    const svc = makeService();
    expect(() => svc.updatePaymentStatus('ghost-id', 'ready')).toThrow(/not found/i);
  });
});

// ---------------------------------------------------------------------------
describe('state machine — complete valid transition paths', () => {
  it('queued → awaiting_liquidity', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    expect(svc.updatePaymentStatus(p.id, 'awaiting_liquidity').status).toBe('awaiting_liquidity');
  });

  it('awaiting_liquidity → ready', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    svc.updatePaymentStatus(p.id, 'awaiting_liquidity');
    expect(svc.updatePaymentStatus(p.id, 'ready').status).toBe('ready');
  });

  it('queued → failed', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    expect(svc.updatePaymentStatus(p.id, 'failed').status).toBe('failed');
  });

  it('awaiting_liquidity → failed', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    svc.updatePaymentStatus(p.id, 'awaiting_liquidity');
    expect(svc.updatePaymentStatus(p.id, 'failed').status).toBe('failed');
  });

  it('ready → failed', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    svc.updatePaymentStatus(p.id, 'ready');
    expect(svc.updatePaymentStatus(p.id, 'failed').status).toBe('failed');
  });

  it('processing → failed', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    svc.updatePaymentStatus(p.id, 'ready');
    svc.updatePaymentStatus(p.id, 'processing');
    expect(svc.updatePaymentStatus(p.id, 'failed').status).toBe('failed');
  });

  it('failed → queued (recovery path)', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    svc.updatePaymentStatus(p.id, 'failed');
    expect(svc.updatePaymentStatus(p.id, 'queued').status).toBe('queued');
  });

  it('full happy path: queued → ready → processing → sent', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    svc.updatePaymentStatus(p.id, 'ready');
    svc.updatePaymentStatus(p.id, 'processing');
    const final = svc.updatePaymentStatus(p.id, 'sent');
    expect(final.status).toBe('sent');
  });
});

// ---------------------------------------------------------------------------
describe('state machine — invalid transitions rejected', () => {
  it('queued → processing is invalid', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    expect(() => svc.updatePaymentStatus(p.id, 'processing')).toThrow(/Invalid transition/);
  });

  it('sent is terminal — sent → queued is invalid', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    svc.updatePaymentStatus(p.id, 'ready');
    svc.updatePaymentStatus(p.id, 'processing');
    svc.updatePaymentStatus(p.id, 'sent');
    expect(() => svc.updatePaymentStatus(p.id, 'queued')).toThrow(/Invalid transition/);
  });

  it('processing → ready is invalid (no backward transition)', () => {
    const svc = makeService();
    const p = svc.createPayment(validInput);
    svc.updatePaymentStatus(p.id, 'ready');
    svc.updatePaymentStatus(p.id, 'processing');
    expect(() => svc.updatePaymentStatus(p.id, 'ready')).toThrow(/Invalid transition/);
  });
});
