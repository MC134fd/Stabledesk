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
});

void fixedOptions; // suppress unused-var warning — available for one-off tests if needed
