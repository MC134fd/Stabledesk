export type PaymentStatus = "pending" | "processing" | "completed" | "failed";

export interface PaymentRequest {
  recipient: string;
  amountUsdc: bigint;
  memo?: string;
  scheduledAt?: Date;
}

export interface PaymentRecord {
  id: string;
  recipient: string;
  /** Amount in micro-USDC (6 decimals) */
  amountUsdc: bigint;
  memo: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  scheduledAt: string;
  txSignature?: string;
  failureReason?: string;
}
