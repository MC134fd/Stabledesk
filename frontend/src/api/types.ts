export type PaymentStatus =
  | 'queued'
  | 'awaiting_liquidity'
  | 'ready'
  | 'processing'
  | 'sent'
  | 'failed';

export type TreasuryStateResponse = {
  liquidUsdc: string;
  liquidUsdcFormatted: string;
  kaminoDeposited: string;
  kaminoDepositedFormatted: string;
  totalUsdc: string;
  totalUsdcFormatted: string;
  pendingObligations: string;
  lastUpdatedAt: string;
  lastDecision: PolicyDecision | null;
  totalLiquid: string;
  totalDeployed: string;
  totalAum: string;
  tokenBalances: Record<string, number>;
  executionMode: 'auto' | 'manual';
  pendingRecommendation: PendingRecommendation | null;
};

export type PendingRecommendation = {
  action: 'deposit' | 'withdraw';
  tokenSymbol: string;
  amountRaw: string;
  amountHuman: number;
};

export type PolicyDecision = {
  action: 'deposit' | 'withdraw' | 'none';
  amountUsdc?: number;
  reason?: string;
  paymentProcessing?: boolean;
  availableForPayments?: number;
  slot?: number;
  timestamp?: string;
};

export type PaymentResponse = {
  id: string;
  recipient: string;
  amount: number;
  currency: string;
  mint: string;
  decimals: number;
  status: PaymentStatus;
  createdAt: string;
  dueAt?: string;
  reference?: string;
  txSignature?: string;
  failureReason?: string;
};

export type LendingPositionResponse = {
  protocol: string;
  token: string;
  mint: string;
  deposited: string;
  apy: number;
  apyFormatted: string;
};

export type LendingResponse = {
  positions: LendingPositionResponse[];
  totalByToken: Record<string, string>;
  totalValueUsdc: string;
};

export type BestApyResponse = {
  token: string;
  protocol: string;
  apy: number;
  apyFormatted: string;
};

export type AuditEvent = {
  id: string;
  action: string;
  result: string;
  params?: Record<string, unknown>;
  timestamp: string;
};

export type AuthUser = {
  id: string;
  email: string;
  createdAt?: string;
};

export type HealthResponse = {
  status: string;
  timestamp: string;
};

export type StablecoinOption = {
  symbol: string;
  name: string;
  mint: string;
};

export type CreatePaymentInput = {
  recipient: string;
  amount: number;
  currency?: string;
  reference?: string;
  dueAt?: string;
};
