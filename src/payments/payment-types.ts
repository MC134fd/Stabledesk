// TODO: On-chain execution (signing and submitting USDC transfers) comes in a later milestone.

export type PaymentStatus =
  | 'queued'
  | 'awaiting_liquidity'
  | 'ready'
  | 'processing'
  | 'sent'
  | 'failed';

export type Payment = {
  id: string;
  recipient: string;
  amountUsdc: number;
  currency: 'USDC';
  status: PaymentStatus;
  createdAt: string;
  dueAt?: string;
  reference?: string;
  txSignature?: string;    // Set after successful on-chain execution
  failureReason?: string;  // Set if status is 'failed'
};

export type CreatePaymentInput = {
  recipient: string;
  amountUsdc: number;
  dueAt?: string;
  reference?: string;
};

/** Alias for CreatePaymentInput — used by API layer */
export type PaymentRequest = CreatePaymentInput;

export type PendingPaymentsSummary = {
  count: number;
  total: number;
};
