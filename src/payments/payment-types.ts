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
  amount: number;
  currency: string;          // e.g. 'USDC', 'USDT', 'PYUSD'
  mint: string;              // token mint address
  decimals: number;          // token decimals (e.g. 6)
  status: PaymentStatus;
  createdAt: string;
  dueAt?: string;
  reference?: string;
  txSignature?: string;      // Set after successful on-chain execution
  failureReason?: string;    // Set if status is 'failed'
};

export type CreatePaymentInput = {
  recipient: string;
  amount: number;
  currency?: string;         // defaults to 'USDC'
  dueAt?: string;
  reference?: string;
};

/** Alias for CreatePaymentInput — used by API layer */
export type PaymentRequest = CreatePaymentInput;

export type PendingPaymentsSummary = {
  count: number;
  total: number;
};
