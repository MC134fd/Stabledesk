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
};

export type CreatePaymentInput = {
  recipient: string;
  amountUsdc: number;
  dueAt?: string;
  reference?: string;
};

export type PendingPaymentsSummary = {
  count: number;
  total: number;
};
