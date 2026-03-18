import { randomUUID } from "node:crypto";
import type { PaymentRequest, PaymentRecord } from "./payment-types.js";
import { paymentStore } from "./payment-store.js";
import { canApprovePayment } from "../core/liquidity-policy.js";
import type { TreasuryState } from "../core/treasury-state.js";
import type { TreasuryPolicy } from "../config/policy.js";
import type { UsdcClient } from "../integrations/usdc.js";
import type { KoraClient } from "../integrations/kora.js";
import { auditService } from "../audit/audit-service.js";
import { createLogger } from "../audit/logger.js";

const log = createLogger("payments");

export interface PaymentServiceDeps {
  usdc: UsdcClient;
  kora: KoraClient;
  getState: () => TreasuryState;
  policy: TreasuryPolicy;
}

export function createPaymentService(deps: PaymentServiceDeps) {
  return {
    createPayment(req: PaymentRequest): PaymentRecord {
      // Validate amount is positive
      if (req.amountUsdc <= 0n) {
        throw new Error("Payment amount must be positive");
      }

      // Validate against disallowed recipients
      if (deps.policy.disallowedRecipients.includes(req.recipient)) {
        throw new Error(`Recipient ${req.recipient} is blocked by policy`);
      }

      // Check liquidity policy
      const check = canApprovePayment(req.amountUsdc, deps.getState(), deps.policy);
      if (!check.approved) {
        throw new Error(`Payment rejected: ${check.reason}`);
      }

      const now = new Date().toISOString();
      const record: PaymentRecord = {
        id: randomUUID(),
        recipient: req.recipient,
        amountUsdc: req.amountUsdc,
        memo: req.memo ?? "",
        status: "pending",
        createdAt: now,
        updatedAt: now,
        scheduledAt: req.scheduledAt?.toISOString() ?? now,
      };

      paymentStore.save(record);
      auditService.record("payment.created", {
        paymentId: record.id,
        recipient: record.recipient,
        amount: record.amountUsdc.toString(),
      }, "success");

      log.info("Payment created", { id: record.id, amount: record.amountUsdc.toString() });
      return record;
    },

    async processPayment(id: string): Promise<PaymentRecord> {
      const record = paymentStore.findById(id);
      if (!record) throw new Error(`Payment ${id} not found`);
      if (record.status === "completed") return record;
      if (record.status === "processing") return record; // idempotent

      // Re-validate liquidity before processing — state may have changed since creation
      const recheck = canApprovePayment(record.amountUsdc, deps.getState(), deps.policy);
      if (!recheck.approved) {
        log.warn("Payment deferred — liquidity changed since creation", {
          id,
          reason: recheck.reason,
        });
        // Leave as pending so it retries next tick (don't mark as failed)
        return record;
      }

      paymentStore.updateStatus(id, "processing");

      try {
        // Build USDC transfer transaction
        const tx = await deps.usdc.buildTransferTx(record.recipient, record.amountUsdc);

        // Send through Kora (gasless) or direct
        const sig = await deps.kora.sendTransaction(tx);

        const updated = paymentStore.updateStatus(id, "completed", { txSignature: sig });
        auditService.record("payment.completed", {
          paymentId: id,
          txSignature: sig,
        }, "success");

        log.info("Payment completed", { id, txSignature: sig });
        return updated;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const updated = paymentStore.updateStatus(id, "failed", { failureReason: reason });
        auditService.record("payment.failed", {
          paymentId: id,
          reason,
        }, "failure");

        log.error("Payment failed", { id, reason });
        return updated;
      }
    },

    async processPending(): Promise<number> {
      const pending = paymentStore.findByStatus("pending");
      const now = new Date();
      let processed = 0;

      for (const p of pending) {
        // Only process payments that are scheduled for now or earlier
        if (new Date(p.scheduledAt) > now) continue;

        await this.processPayment(p.id);
        processed++;
      }

      return processed;
    },
  };
}
