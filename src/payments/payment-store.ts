import type { PaymentRecord, PaymentStatus } from "./payment-types.js";

const store = new Map<string, PaymentRecord>();

export const paymentStore = {
  save(record: PaymentRecord): void {
    store.set(record.id, { ...record });
  },

  findById(id: string): PaymentRecord | undefined {
    const r = store.get(id);
    return r ? { ...r } : undefined;
  },

  findByStatus(status: PaymentStatus): PaymentRecord[] {
    return [...store.values()].filter((r) => r.status === status);
  },

  updateStatus(
    id: string,
    status: PaymentStatus,
    extra?: Partial<Pick<PaymentRecord, "txSignature" | "failureReason">>,
  ): PaymentRecord {
    const record = store.get(id);
    if (!record) throw new Error(`Payment ${id} not found`);
    record.status = status;
    record.updatedAt = new Date().toISOString();
    if (extra?.txSignature) record.txSignature = extra.txSignature;
    if (extra?.failureReason) record.failureReason = extra.failureReason;
    return { ...record };
  },

  all(): PaymentRecord[] {
    return [...store.values()];
  },

  clear(): void {
    store.clear();
  },
};
