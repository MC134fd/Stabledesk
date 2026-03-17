// TODO: Define all payment-related TypeScript types and enums.
// - PaymentRequest: id, recipient, amount (USDC), memo, scheduledAt
// - PaymentStatus: pending | processing | completed | failed
// - PaymentRecord: full lifecycle record including txSignature and timestamps
// - Ensure amounts are represented as bigint to avoid floating-point issues

export type PaymentPlaceholder = {
  // TODO: replace with PaymentRequest, PaymentRecord, PaymentStatus
  _placeholder: never;
};
