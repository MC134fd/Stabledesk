import { describe, it } from 'vitest';

// TODO: Tests for the full payment request lifecycle.
// Use fixture data from tests/fixtures/payments.fixture.json.

describe('PaymentService', () => {
  it.todo('should create a payment record in pending status');
  it.todo('should transition payment to processing then completed on success');
  it.todo('should transition payment to failed if transaction submission fails');
  it.todo('should not process a duplicate payment (idempotency check)');
  it.todo('should reject a payment that violates the liquidity policy');
  it.todo('should store the transaction signature on completion');
  it.todo('should emit an audit event for every status transition');
});
