import type { PaymentRecord, PaymentStatus } from "./payment-types.js";

const store = new Map<string, PaymentRecord>();

/** Maximum completed/failed records to retain */
const MAX_TERMINAL_RECORDS = 5_000;

/** Evict oldest completed/failed records when capacity is exceeded */
function evictTerminal(): void {
  const terminal = [...store.values()]
    .filter((r) => r.status === "completed" || r.status === "failed");
  if (terminal.length <= MAX_TERMINAL_RECORDS) return;

  // Sort by updatedAt ascending (oldest first)
  terminal.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const toRemove = terminal.length - MAX_TERMINAL_RECORDS;
  for (let i = 0; i < toRemove; i++) {
    store.delete(terminal[i].id);
  }
}

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

    // Evict old terminal records periodically
    if (status === "completed" || status === "failed") {
      evictTerminal();
    }

    return { ...record };
  },

  all(): PaymentRecord[] {
    return [...store.values()];
  },

  clear(): void {
    store.clear();
  },
};
