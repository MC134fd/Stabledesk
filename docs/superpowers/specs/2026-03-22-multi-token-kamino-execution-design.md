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

**Rename** `src/integrations/usdc.ts` → `src/integrations/token-balances.ts`

**New function:** `fetchAllStablecoinBalances(connection, walletPubkey)`
- Calls `getParsedTokenAccountsByOwner` twice in parallel:
  - Once with SPL Token program ID (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)
  - Once with Token-2022 program ID (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`)
- Matches results against `STABLECOINS` registry by mint address
- Returns `Record<string, number>` keyed by symbol: `{ USDC: 7.00, USDT: 0, USDS: 0, PYUSD: 0, USDG: 0, USD1: 0 }`
- Always includes all 6 enabled stablecoins, defaulting to 0

**`TreasuryState` type** gains a `tokenBalances: Record<string, number>` field.

**`buildTreasuryState`** calls `fetchAllStablecoinBalances` and populates:
- `tokenBalances` — the full per-token map
- `usdcBalance` — still set from `tokenBalances.USDC` for backward compatibility

**`/state` endpoint** adds `tokenBalances` to the JSON response.

### Frontend

**Types:** `TreasuryStateResponse` gains `tokenBalances: Record<string, number>`.

**Dashboard metric card:** "Available USDC" → "Available USD". Value = sum of all `tokenBalances` values.

**Balance Sheet component:** New component rendered below the metric cards row. Compact table/grid showing:
- Stablecoin symbol (USDC, USDT, USDS, PYUSD, USDG, USD1)
- Balance formatted as USD
- All 6 always visible, $0.00 for zero balances

## Section 2: Multi-Market Kamino

### Backend

**`env.ts`:** `KAMINO_MARKET_ADDRESS` split on commas, trimmed. Returns `string[]`.

**New optional env var:** `KAMINO_MARKET_LABELS` — comma-separated labels (e.g. `Main,Allez`). Defaults to "Market 1", "Market 2", etc.

**`index.ts`:** Loop over market addresses, push one `createKaminoAdapter()` per entry.

**`createKaminoAdapter`:** Accepts optional `label` parameter for display name (e.g. "Kamino Lend (Main)", "Kamino Lend (Allez)"). Single market keeps current "Kamino Lend" name.

**No frontend changes needed** — `/lending` endpoint already returns all adapter positions; the lending page renders them.

### `.env` update

```
KAMINO_MARKET_ADDRESS=7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF,A1USdzqDHmw5oz97AkqAGLxEQZfFjASZFuy4T6Qdvnpo
KAMINO_MARKET_LABELS=Main,Allez
```

## Section 3: Transaction Execution with Auto/Manual Toggle

### Backend

**Scheduler state:** New field `executionMode: 'auto' | 'manual'`, defaults to `'manual'`.

**New endpoints:**
- `POST /settings/execution-mode` — accepts `{ mode: 'auto' | 'manual' }`, updates scheduler mode
- `POST /execute` — manual-mode only; triggers execution of the current recommended action (deposit/withdraw via lending manager). Returns transaction result or error

**`GET /state`:** Response adds `executionMode` field.

**Scheduler `tick()` behavior:**
- `'auto'` mode: passes `executionMode: 'execute'` to `runSchedulerCycle`, uses lending manager's `deposit`/`withdraw` methods for on-chain transactions
- `'manual'` mode: passes `'dry_run'` (current behavior), stores recommendation for `/execute` endpoint

**Wiring:** The scheduler uses `LendingManager.deposit()` and `LendingManager.withdraw()` directly (not the separate `KaminoClient` interface), since the manager already handles yield-optimized routing across protocols.

### Frontend

**Policy Engine card:**
- Auto/manual toggle switch at the top, calls `POST /settings/execution-mode`
- **Manual mode:** When last decision recommends deposit/withdraw, an "Execute" button appears below the decision badge. Clicking calls `POST /execute`
- **Auto mode:** No execute button; label shows "Auto-executing"

## Files Changed

### Backend (modified)
- `src/integrations/usdc.ts` → renamed to `src/integrations/token-balances.ts`
- `src/core/treasury-state.ts` — add `tokenBalances` field
- `src/core/scheduler.ts` — add `executionMode` state, wire execution
- `src/config/env.ts` — parse comma-separated Kamino markets + labels
- `src/index.ts` — multi-market adapter loop, pass execution deps
- `src/api.ts` — new endpoints, add `tokenBalances` and `executionMode` to `/state`

### Backend (new)
- None — all changes are modifications to existing files

### Frontend (modified)
- `frontend/src/api/types.ts` — add `tokenBalances`, `executionMode`
- `frontend/src/api/hooks.ts` — add mutation hooks for execution mode and execute
- `frontend/src/pages/Dashboard.tsx` — "Available USD", balance sheet, execution toggle

### Frontend (new)
- `frontend/src/components/BalanceSheet.tsx` — per-stablecoin balance table

### Config
- `.env` — update `KAMINO_MARKET_ADDRESS` to comma-separated, add `KAMINO_MARKET_LABELS`
