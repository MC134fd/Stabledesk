import type { Payment, PaymentStatus, PendingPaymentsSummary } from './payment-types.js';

const PENDING_STATUSES = new Set<PaymentStatus>([
  'queued',
  'awaiting_liquidity',
  'ready',
  'processing',
]);

export type PaymentStore = {
  create(payment: Payment): Payment;
  getById(id: string): Payment | undefined;
  listAll(): Payment[];
  listPending(): Payment[];
  updateStatus(id: string, nextStatus: PaymentStatus): Payment;
  summarizePending(): PendingPaymentsSummary;
};

export function createPaymentStore(): PaymentStore {
  const store = new Map<string, Payment>();

  return {
    create(payment) {
      store.set(payment.id, payment);
      return payment;
    },

    getById(id) {
      return store.get(id);
    },

    listAll() {
      return [...store.values()];
    },

    listPending() {
      return [...store.values()].filter((p) => PENDING_STATUSES.has(p.status));
    },

    updateStatus(id, nextStatus) {
      const payment = store.get(id);
      if (!payment) throw new Error(`Payment not found: "${id}"`);
      const updated = { ...payment, status: nextStatus };
      store.set(id, updated);
      return updated;
    },

    summarizePending() {
      const pending = [...store.values()].filter((p) => PENDING_STATUSES.has(p.status));
      return {
        count: pending.length,
        total: pending.reduce((sum, p) => sum + p.amountUsdc, 0),
      };
    },
  };
}
