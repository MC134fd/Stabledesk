# StableDesk — Test Strategy

All tests use **Vitest**. Run with `npm test`.

---

## Connectivity Tests (`tests/connectivity/`)

Validate live access to external infrastructure. These tests require real environment variables (RPC endpoint, wallet) and should **not** run in CI by default without a funded devnet setup.

- Confirm the Solana RPC endpoint is reachable and returns a valid blockhash.
- Confirm the treasury wallet and USDC token account exist on-chain.

<!-- TODO: add a Vitest project config to tag these as "integration" and exclude from the default run -->

---

## Treasury State Tests (`tests/core/treasury-state.test.ts`)

Unit tests for the treasury state data model. All chain calls should be stubbed so these run offline.

- State initializes correctly with zero balances.
- Liquid + deployed balances sum to total correctly.
- State refresh updates the timestamp and slot.
- Edge cases: missing token account, zero Kamino position.

---

## Liquidity Policy Tests (`tests/core/liquidity-policy.test.ts`)

Pure logic tests — no I/O, no chain calls. Use `tests/fixtures/policy.fixture.json` and `treasury.fixture.json` as input data.

- Policy correctly identifies over-liquid state (should deploy to Kamino).
- Policy correctly identifies under-liquid state (should withdraw from Kamino).
- Policy blocks payments that would breach the minimum reserve.
- Edge cases: total balance zero, exact threshold boundary conditions.

---

## Payment Workflow Tests (`tests/payments/payment-service.test.ts`)

End-to-end lifecycle tests for the payment pipeline. Chain submission should be stubbed.

- Create → pending → processing → completed happy path.
- Failure path: transaction rejected, status transitions to failed.
- Idempotency: submitting the same payment ID twice does not double-spend.
- Liquidity gate: payment blocked when reserve is insufficient.
- Audit events emitted at each status transition.

---

## Kamino Integration Tests (`tests/integrations/kamino.test.ts`)

Tests for deposit/withdraw instruction building and position fetching. Live tests require a devnet position.

- Fetch deposited balance and accrued yield.
- Build deposit and withdraw instructions (validate account keys, amounts).
- Error handling: withdraw more than deposited, zero-balance position.

<!-- TODO: separate unit tests (offline, instruction shape) from live devnet tests -->

---

## Scheduler Tests (`tests/core/scheduler.test.ts`)

Unit tests for the scheduler tick lifecycle. Use fake timers.

- Ticks fire at the configured interval.
- A failing tick does not crash the scheduler.
- Concurrent ticks do not overlap.
- Graceful stop: no further ticks after stop() is called.

---

## Audit and Safety Tests (`tests/audit/audit-service.test.ts`)

Verify the integrity and completeness of the audit trail.

- Every treasury action produces a persisted audit event.
- Events are immutable after recording.
- Query by action type and date range returns correct results.
- Compliance report export includes all required fields.

<!-- TODO: define the canonical audit event schema before implementing -->
