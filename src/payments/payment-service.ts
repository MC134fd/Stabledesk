import type { Payment, PaymentStatus, CreatePaymentInput, PendingPaymentsSummary } from './payment-types.js';
import { createPaymentStore, type PaymentStore } from './payment-store.js';

// Allowed status transitions — terminal states have no outgoing edges
const TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  queued:              ['awaiting_liquidity', 'ready', 'failed'],
  awaiting_liquidity:  ['ready', 'failed'],
  ready:               ['processing', 'failed'],
  processing:          ['sent', 'failed'],
  failed:              ['queued'],
  sent:                [],
};

type ServiceOptions = {
  now?: () => string;
  generateId?: () => string;
};

export type PaymentService = {
  createPayment(input: CreatePaymentInput): Payment;
  getPayment(id: string): Payment | undefined;
  listPayments(): Payment[];
  listPendingPayments(): Payment[];
  updatePaymentStatus(id: string, nextStatus: PaymentStatus): Payment;
  summarizePendingPayments(): PendingPaymentsSummary;
};

let _counter = 0;
function defaultGenerateId(): string {
  return `pay_${Date.now()}_${++_counter}`;
}

export function createPaymentService(
  store: PaymentStore = createPaymentStore(),
  options: ServiceOptions = {},
): PaymentService {
  const now = options.now ?? (() => new Date().toISOString());
  const generateId = options.generateId ?? defaultGenerateId;

  return {
    createPayment(input) {
      const recipient = input.recipient.trim();
      if (!recipient) throw new Error('recipient must not be empty');

      const { amountUsdc } = input;
      if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
        throw new Error(`amountUsdc must be a finite positive number, got: ${amountUsdc}`);
      }

      const payment: Payment = {
        id: generateId(),
        recipient,
        amountUsdc,
        currency: 'USDC',
        status: 'queued',
        createdAt: now(),
        ...(input.dueAt !== undefined && { dueAt: input.dueAt }),
        ...(input.reference !== undefined && { reference: input.reference }),
      };

      return store.create(payment);
    },

    getPayment(id) {
      return store.getById(id);
    },

    listPayments() {
      return store.listAll();
    },

    listPendingPayments() {
      return store.listPending();
    },

    updatePaymentStatus(id, nextStatus) {
      const payment = store.getById(id);
      if (!payment) throw new Error(`Payment not found: "${id}"`);

      const allowed = TRANSITIONS[payment.status];
      if (!allowed.includes(nextStatus)) {
        throw new Error(
          `Invalid transition: "${payment.status}" -> "${nextStatus}"`,
        );
      }

      return store.updateStatus(id, nextStatus);
    },

    summarizePendingPayments() {
      return store.summarizePending();
    },
  };
}
