# Multi-Token Balances, Multi-Market Kamino, and Execution Toggle

**Date:** 2026-03-22
**Status:** Approved

## Summary

Three features that expand StableDesk from a USDC-only dashboard to a full multi-stablecoin treasury with actionable execution:

1. **Multi-stablecoin balance sheet** — fetch and display balances for all 6 enabled stablecoins (USDC, USDT, USDS, PYUSD, USDG, USD1), replacing "Available USDC" with "Available USD" (sum of all, 1:1 peg assumption)
2. **Multi-market Kamino** — support comma-separated `KAMINO_MARKET_ADDRESS` env var, creating one adapter per market
3. **Execution toggle** — auto/manual toggle on the Dashboard Policy Engine card, enabling actual on-chain Kamino deposits/withdrawals

## Section 1: Multi-Stablecoin Balance Fetching

### Backend

**Keep** `src/integrations/usdc.ts` for the existing `createUsdcClient` / `UsdcTokenClient` exports (used by payment service for USDC transfers). **Add** a new `fetchAllStablecoinBalances` function to the same file.

**New function:** `fetchAllStablecoinBalances(connection, walletPubkey)`
- Calls `getParsedTokenAccountsByOwner` twice in parallel:
  - Once with SPL Token program ID (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)
  - Once with Token-2022 program ID (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`)
- Combines results, then filters to only mints present in `getEnabledStablecoins()` from the stablecoin registry
- Returns `Record<string, number>` keyed by symbol: `{ USDC: 7.00, USDT: 0, USDS: 0, PYUSD: 0, USDG: 0, USD1: 0 }`
- Always includes all 6 enabled stablecoins, defaulting to 0 for tokens with no on-chain account

**`TreasuryState` type** gains a `tokenBalances: Record<string, number>` field.

**`buildTreasuryState` changes:**
- Replaces the single `usdcClient.getBalance()` call with `fetchAllStablecoinBalances()`
- Populates `tokenBalances` with the full per-token map
- Sets `usdcBalance = tokenBalances.USDC ?? 0` for backward compatibility
- The `usdcMint` parameter is removed (no longer needed — the registry provides all mints)
- Note: the existing `TokenClient` interface stub in `usdc.ts` is not used; `fetchAllStablecoinBalances` is a standalone function that `buildTreasuryState` calls directly

**`/state` endpoint** adds `tokenBalances` to the JSON response.

### Frontend

**Types:** `TreasuryStateResponse` gains `tokenBalances: Record<string, number>`.

**Dashboard metric card:** "Available USDC" → "Available USD". Value = sum of all `tokenBalances` values.

**Balance Sheet component:** New component rendered below the metric cards row. Compact table/grid showing:
- Stablecoin symbol (USDC, USDT, USDS, PYUSD, USDG, USD1)
- Balance formatted as USD
- All 6 always visible, $0.00 for zero balances

**"Earning Yield" card** remains USDC-only for now (shows `kaminoDeposited`). Multi-token deployed balances is a future enhancement.

## Section 2: Multi-Market Kamino

### Backend

**`env.ts`:** `KAMINO_MARKET_ADDRESS` split on commas, trimmed. Type changes from `string | undefined` to `string[]` (empty array if not set). New optional `KAMINO_MARKET_LABELS: string | undefined` env var.

**`index.ts`:** Loop over the market addresses array, push one `createKaminoAdapter()` per entry with its label.

**`ProtocolId` type change:** `ProtocolId` in `types.ts` changes from a closed union (`"kamino" | "marginfi" | ...`) to `string`. This is required because multiple Kamino adapters need unique IDs like `"kamino-main"`, `"kamino-allez"`.

**`createKaminoAdapter` changes:**
- Accepts optional `label` parameter and an `idSuffix` parameter
- `id` becomes `"kamino"` when there's one market, or `"kamino-main"` / `"kamino-allez"` when there are multiple
- `name` becomes `"Kamino Lend"` for single market, `"Kamino Lend (Main)"` / `"Kamino Lend (Allez)"` for multiple

**`LendingManager`:** The `adapters` map key type follows `ProtocolId` → `string`. No logic changes — it already aggregates across all adapters.

**No frontend changes needed** — `/lending` endpoint already returns all adapter positions; the lending page renders them.

### `.env` update

```
KAMINO_MARKET_ADDRESS=7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF,A1USdzqDHmw5oz97AkqAGLxEQZfFjASZFuy4T6Qdvnpo
KAMINO_MARKET_LABELS=Main,Allez
```

## Section 3: Transaction Execution with Auto/Manual Toggle

### Backend

**Scheduler state:** New field `executionMode: 'auto' | 'manual'`, defaults to `'manual'`. This is intentionally ephemeral (in-memory only) — server restart resets to manual as a fail-safe.

**New endpoints:**
- `POST /settings/execution-mode` — accepts `{ mode: 'auto' | 'manual' }`, updates scheduler mode. No auth required (matches current API posture — all endpoints are open, noted in `api.ts` line 75).
- `POST /execute` — manual-mode only; triggers execution of the current recommended action. Returns 400 if called in auto mode. Returns the transaction signature(s) or error.

**`GET /state`:** Response adds `executionMode` field.

**Execution wiring:** The existing `runSchedulerCycle` uses a `KaminoClient` interface for execution (lines 99-125 of `scheduler.ts`). This is replaced with a new execution approach:

1. `LendingManager.buildOptimalDepositTx()` / `buildOptimalWithdrawTxs()` return unsigned `Transaction` objects
2. A new `executeTransaction(tx, solanaClient)` helper signs the transaction with the treasury keypair and sends via `solanaClient.sendAndConfirm()`
3. The `KaminoClient` dependency is removed from `SchedulerCycleDeps` — the lending manager + solana client handle everything

**Scheduler stores a pending recommendation:** When in manual mode, the scheduler stores `{ action, tokenSymbol, amount }` from the last evaluation. The `POST /execute` endpoint reads this, builds the transaction via lending manager, signs and sends it.

**Scheduler `tick()` behavior:**
- `'auto'` mode: after evaluating policy, immediately builds + signs + sends deposit/withdraw transactions via lending manager
- `'manual'` mode: evaluates policy, stores recommendation, does not execute

### Frontend

**Policy Engine card:**
- Auto/manual toggle switch at the top, calls `POST /settings/execution-mode`
- **Manual mode:** When last decision recommends deposit/withdraw, an "Execute" button appears below the decision badge. Clicking calls `POST /execute`
- **Auto mode:** No execute button; shows "Auto-executing" label

## Files Changed

### Backend (modified)
- `src/integrations/usdc.ts` — add `fetchAllStablecoinBalances`, keep existing `createUsdcClient`
- `src/integrations/lending/types.ts` — change `ProtocolId` from closed union to `string`
- `src/integrations/lending/kamino-adapter.ts` — add `label` and `idSuffix` params
- `src/integrations/lending/manager.ts` — update map key type
- `src/core/treasury-state.ts` — add `tokenBalances` field, update `buildTreasuryState`
- `src/core/scheduler.ts` — add `executionMode` state, replace `KaminoClient` with lending manager execution, store pending recommendation
- `src/config/env.ts` — parse comma-separated Kamino markets + labels, type changes
- `src/index.ts` — multi-market adapter loop, pass execution deps
- `src/api.ts` — new endpoints, add `tokenBalances` and `executionMode` to `/state`

### Frontend (modified)
- `frontend/src/api/types.ts` — add `tokenBalances`, `executionMode`
- `frontend/src/api/hooks.ts` — add mutation hooks for execution mode and execute
- `frontend/src/pages/Dashboard.tsx` — "Available USD", balance sheet, execution toggle

### Frontend (new)
- `frontend/src/components/BalanceSheet.tsx` — per-stablecoin balance table

### Config
- `.env` — update `KAMINO_MARKET_ADDRESS` to comma-separated, add `KAMINO_MARKET_LABELS`
