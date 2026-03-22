# Multi-Token Balances, Multi-Market Kamino, and Execution Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-stablecoin balance display, multi-market Kamino support, and an auto/manual execution toggle for on-chain transactions.

**Architecture:** Extend the existing balance fetching in `usdc.ts` to query both SPL Token and Token-2022 programs for all 6 enabled stablecoins. Widen `ProtocolId` to `string` so multiple Kamino adapters can coexist. Replace the `KaminoClient` execution path with `LendingManager.buildOptimalDepositTx()` + `solanaClient.sendAndConfirm()`, gated by an in-memory `executionMode` toggle.

**Tech Stack:** TypeScript, @solana/web3.js, Hono, React, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-22-multi-token-kamino-execution-design.md`

---

## File Map

### Backend — modified
| File | Responsibility |
|------|---------------|
| `src/integrations/usdc.ts` | Add `fetchAllStablecoinBalances()` alongside existing USDC client |
| `src/integrations/lending/types.ts` | Widen `ProtocolId` from union to `string` |
| `src/integrations/lending/kamino-adapter.ts` | Accept `id` and `label` params for multi-market |
| `src/core/treasury-state.ts` | Add `tokenBalances` field, use `fetchAllStablecoinBalances` |
| `src/core/scheduler.ts` | Add `executionMode` toggle, replace `KaminoClient` with lending manager execution, store pending recommendation |
| `src/config/env.ts` | Parse comma-separated `KAMINO_MARKET_ADDRESS` + `KAMINO_MARKET_LABELS` |
| `src/index.ts` | Multi-market adapter loop, pass `solanaClient` + `lendingManager` to scheduler |
| `src/api.ts` | Add `tokenBalances`/`executionMode` to `/state`, new `POST /settings/execution-mode` and `POST /execute` endpoints |
| `frontend/vite.config.ts` | Add `/settings` and `/execute` proxy entries |

### Frontend — modified
| File | Responsibility |
|------|---------------|
| `frontend/src/api/types.ts` | Add `tokenBalances`, `executionMode` to response types |
| `frontend/src/api/hooks.ts` | Add `useSetExecutionMode()` and `useExecute()` mutation hooks |
| `frontend/src/pages/Dashboard.tsx` | "Available USD" metric, balance sheet, execution toggle + button |

### Frontend — new
| File | Responsibility |
|------|---------------|
| `frontend/src/components/BalanceSheet.tsx` | Per-stablecoin balance table component |

### Config
| File | Change |
|------|--------|
| `.env` | Update `KAMINO_MARKET_ADDRESS` to comma-separated, add `KAMINO_MARKET_LABELS` |

---

## Task 1: Add `fetchAllStablecoinBalances` to `usdc.ts`

**Files:**
- Modify: `src/integrations/usdc.ts`

- [ ] **Step 1: Add Token-2022 program ID constant and import `getEnabledStablecoins`**

At the top of `src/integrations/usdc.ts`, add:

```typescript
import { getEnabledStablecoins } from '../config/stablecoins.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
```

- [ ] **Step 2: Add `fetchAllStablecoinBalances` function**

Below the existing `usdcClient` export, add:

```typescript
export async function fetchAllStablecoinBalances(
  connection: Connection,
  walletAddress: string,
): Promise<Record<string, number>> {
  const walletKey = new PublicKey(walletAddress);
  const enabledCoins = getEnabledStablecoins();

  // Build result with all enabled coins defaulting to 0
  const balances: Record<string, number> = {};
  for (const coin of enabledCoins) {
    balances[coin.symbol] = 0;
  }

  // Build a mint→symbol lookup set for fast filtering
  const mintSet = new Map<string, string>();
  for (const coin of enabledCoins) {
    mintSet.set(coin.mint, coin.symbol);
  }

  try {
    // Query both token programs in parallel
    const [splResult, t22Result] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(walletKey, {
        programId: TOKEN_PROGRAM_ID,
      }),
      connection.getParsedTokenAccountsByOwner(walletKey, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

    const allAccounts = [...splResult.value, ...t22Result.value];

    for (const acct of allAccounts) {
      const info = acct.account.data.parsed.info;
      const mint: string = info.mint;
      const symbol = mintSet.get(mint);
      if (!symbol) continue; // Not a tracked stablecoin
      const ui: number = info.tokenAmount.uiAmount ?? 0;
      balances[symbol] += ui;
    }

    log.debug('All stablecoin balances fetched', { balances });
  } catch (err) {
    log.warn('Failed to fetch stablecoin balances — returning zeros', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return balances;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `usdc.ts`

- [ ] **Step 4: Commit**

```bash
git add src/integrations/usdc.ts
git commit -m "feat: add fetchAllStablecoinBalances for multi-token support"
```

---

## Task 2: Add `tokenBalances` to `TreasuryState` and `buildTreasuryState`

**Files:**
- Modify: `src/core/treasury-state.ts`

- [ ] **Step 1: Add `tokenBalances` to the `TreasuryState` type**

In `src/core/treasury-state.ts`, add to the type (after `lastUpdatedAt`):

```typescript
tokenBalances: Record<string, number>;
```

- [ ] **Step 2: Update `buildTreasuryState` to use `fetchAllStablecoinBalances`**

Replace the import of `usdcClient` with:

```typescript
import { fetchAllStablecoinBalances } from '../integrations/usdc.js';
```

Change the function signature — remove `usdcMint` parameter:

```typescript
export async function buildTreasuryState(
  connection: Connection,
  treasuryWallet: string,
  getPendingPayments: () => PendingPaymentsSummary = defaultPendingPayments,
  getKaminoUsdcBalance: () => Promise<number> = defaultKaminoBalance,
): Promise<TreasuryState> {
  const [solBalance, tokenBalances, kaminoUsdcBalance] = await Promise.all([
    solanaClient.getSolBalance(connection, treasuryWallet),
    fetchAllStablecoinBalances(connection, treasuryWallet),
    getKaminoUsdcBalance(),
  ]);

  const pending = getPendingPayments();
  const usdcBalance = tokenBalances['USDC'] ?? 0;

  return {
    treasuryWallet,
    solBalance,
    usdcBalance,
    kaminoUsdcBalance,
    totalUsdcExposure: usdcBalance + kaminoUsdcBalance,
    pendingPaymentsCount: pending.count,
    pendingPaymentsTotal: pending.total,
    lastUpdatedAt: new Date().toISOString(),
    tokenBalances,
  };
}
```

- [ ] **Step 3: Update `emptyState` to include `tokenBalances`**

```typescript
export function emptyState(): TreasuryState {
  return {
    treasuryWallet: '',
    solBalance: 0,
    usdcBalance: 0,
    kaminoUsdcBalance: 0,
    totalUsdcExposure: 0,
    pendingPaymentsCount: 0,
    pendingPaymentsTotal: 0,
    lastUpdatedAt: new Date().toISOString(),
    tokenBalances: {},
  };
}
```

- [ ] **Step 4: Update scheduler `tick()` — remove `usdcMint` argument**

In `src/core/scheduler.ts`, the `tick()` function calls `buildTreasuryState` with `usdcMint` as the 3rd arg. Remove that argument:

```typescript
// Before (line 178-184):
getTreasuryState: () =>
  buildTreasuryState(
    config.solana.connection,
    config.solana.keypair.publicKey.toBase58(),
    usdcMint,
    () => config.paymentService.summarizePendingPayments(),
  ),

// After:
getTreasuryState: () =>
  buildTreasuryState(
    config.solana.connection,
    config.solana.keypair.publicKey.toBase58(),
    () => config.paymentService.summarizePendingPayments(),
  ),
```

Also remove the now-unused `usdcMint` const on line 172 and `usdcMint` from `SchedulerCreateConfig`.

- [ ] **Step 5: Update `/state` endpoint to include `tokenBalances`**

In `src/api.ts`, inside the `GET /state` handler (line 112-131), add `tokenBalances` to the response:

```typescript
tokenBalances: s.tokenBalances,
```

Replace the `tokens: {}` stub line.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/core/treasury-state.ts src/core/scheduler.ts src/api.ts
git commit -m "feat: add tokenBalances to TreasuryState and /state endpoint"
```

---

## Task 3: Widen `ProtocolId` and add multi-market Kamino

**Files:**
- Modify: `src/integrations/lending/types.ts`
- Modify: `src/integrations/lending/kamino-adapter.ts`
- Modify: `src/integrations/lending/manager.ts`
- Modify: `src/config/env.ts`
- Modify: `src/index.ts`
- Modify: `.env`

- [ ] **Step 1: Change `ProtocolId` to `string`**

In `src/integrations/lending/types.ts`, change line 4:

```typescript
// Before:
export type ProtocolId = "kamino" | "marginfi" | "save" | "juplend";

// After:
export type ProtocolId = string;
```

- [ ] **Step 2: Update `createKaminoAdapter` to accept `id` and `label`**

In `src/integrations/lending/kamino-adapter.ts`, change the function signature (line 44-48):

```typescript
export function createKaminoAdapter(
  solana: SolanaClient,
  marketAddress: string,
  programId?: string,
  adapterLabel?: string,
  adapterId?: string,
): LendingAdapter {
```

Update `id` and `name` on lines 79-80:

```typescript
// Before:
id: "kamino" as ProtocolId,
name: "Kamino Lend",

// After:
id: adapterId ?? "kamino",
name: adapterLabel ?? "Kamino Lend",
```

Also update the hardcoded `protocol: "kamino"` in `getPositions()` (line 114) to use the dynamic id:

```typescript
// Store id in a const at the top of the returned object's scope
const id = adapterId ?? "kamino";

// Then in getPositions, line 114:
protocol: id,
```

- [ ] **Step 3: Parse comma-separated Kamino market addresses in `env.ts`**

In `src/config/env.ts`, change the `KAMINO_MARKET_ADDRESS` type from `string | undefined` to `string[]` and add `KAMINO_MARKET_LABELS`:

```typescript
// In EnvConfig type:
KAMINO_MARKET_ADDRESSES: string[];
KAMINO_MARKET_LABELS: string[];
// Remove the old KAMINO_MARKET_ADDRESS field

// In loadEnv():
const rawMarkets = optionalEnv('KAMINO_MARKET_ADDRESS') ?? '';
const KAMINO_MARKET_ADDRESSES = rawMarkets
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const rawLabels = optionalEnv('KAMINO_MARKET_LABELS') ?? '';
const KAMINO_MARKET_LABELS = rawLabels
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
```

Keep `KAMINO_PROGRAM_ID` as-is (shared across all markets).

- [ ] **Step 4: Update `index.ts` to create one adapter per market**

Replace the single Kamino adapter block (lines 52-57) with:

```typescript
// Kamino markets (comma-separated)
const kaminoMarkets = env.KAMINO_MARKET_ADDRESSES;
for (let i = 0; i < kaminoMarkets.length; i++) {
  const marketAddr = kaminoMarkets[i];
  const label = env.KAMINO_MARKET_LABELS[i];
  const isMulti = kaminoMarkets.length > 1;
  const adapterLabel = isMulti
    ? `Kamino Lend (${label || `Market ${i + 1}`})`
    : 'Kamino Lend';
  const adapterId = isMulti
    ? `kamino-${(label || `market${i + 1}`).toLowerCase()}`
    : 'kamino';
  adapters.push(
    createKaminoAdapter(solana, marketAddr, env.KAMINO_PROGRAM_ID || undefined, adapterLabel, adapterId),
  );
}
```

- [ ] **Step 5: Update `.env`**

```
KAMINO_MARKET_ADDRESS=7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF,A1USdzqDHmw5oz97AkqAGLxEQZfFjASZFuy4T6Qdvnpo
KAMINO_MARKET_LABELS=Main,Allez
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/integrations/lending/types.ts src/integrations/lending/kamino-adapter.ts src/config/env.ts src/index.ts
git commit -m "feat: support multiple Kamino markets via comma-separated env var"
```

Note: `.env` is gitignored — changes are local-only. Update your `.env` manually.

---

## Task 4: Add execution toggle to scheduler

**Files:**
- Modify: `src/core/scheduler.ts`
- Modify: `src/api.ts`
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Add `executionMode` state and pending recommendation to scheduler**

In `src/core/scheduler.ts`, update `SchedulerHandle` (line 147-152):

```typescript
export type ExecutionMode = 'auto' | 'manual';

export type PendingRecommendation = {
  action: 'deposit' | 'withdraw';
  tokenSymbol: string;
  amountRaw: bigint; // serialized as string in JSON responses
  amountHuman: number;
};

export type SchedulerHandle = {
  start(): void;
  stop(): void;
  getState(): TreasuryState;
  getLastDecision(): SchedulerDecision | null;
  getExecutionMode(): ExecutionMode;
  setExecutionMode(mode: ExecutionMode): void;
  getPendingRecommendation(): PendingRecommendation | null;
  executePendingRecommendation(): Promise<{ signatures: string[] }>;
};
```

- [ ] **Step 2: Update `SchedulerCreateConfig` to include execution deps**

Remove `usdcMint` (already done in Task 2). Add `solana` client reference is already present. Remove `kaminoClient` from `SchedulerCycleDeps` import:

```typescript
// Remove this import:
import type { KaminoClient } from '../integrations/kamino.js';
```

In `SchedulerCycleDeps` type (line 26-34): remove `kaminoClient?: KaminoClient` and `executionMode?: 'dry_run' | 'execute'` fields. Also remove the destructuring of these at line 48-50 (`kaminoClient`, `executionMode`). Remove the entire `KaminoClient` execution block (lines 98-125) from `runSchedulerCycle`.

- [ ] **Step 3: Add execution mode state and methods to `createScheduler`**

Inside `createScheduler`, add state variables after `intervalId`:

```typescript
let executionMode: ExecutionMode = 'manual';
let pendingRecommendation: PendingRecommendation | null = null;
```

Update `tick()` — after `runSchedulerCycle`, add execution logic:

```typescript
async function tick(): Promise<void> {
  try {
    const decision = await runSchedulerCycle({
      getTreasuryState: () =>
        buildTreasuryState(
          config.solana.connection,
          config.solana.keypair.publicKey.toBase58(),
          () => config.paymentService.summarizePendingPayments(),
        ),
      paymentService: config.paymentService,
      minLiquidUsdc,
      auditService: config.auditService,
    });
    currentState = decision.stateSnapshot;
    lastDecision = decision;

    // Determine pending recommendation
    if (decision.actions.includes('would_deposit') && decision.excessLiquidity > 0) {
      const amountHuman = decision.excessLiquidity;
      const amountRaw = BigInt(Math.floor(amountHuman * 1_000_000));
      pendingRecommendation = { action: 'deposit', tokenSymbol: 'USDC', amountRaw, amountHuman };
    } else if (decision.actions.includes('would_withdraw') && decision.liquidityShortfall > 0) {
      const amountHuman = Math.min(decision.liquidityShortfall, currentState.kaminoUsdcBalance);
      const amountRaw = BigInt(Math.floor(amountHuman * 1_000_000));
      pendingRecommendation = amountHuman > 0
        ? { action: 'withdraw', tokenSymbol: 'USDC', amountRaw, amountHuman }
        : null;
    } else {
      pendingRecommendation = null;
    }

    // Auto-execute if enabled
    if (executionMode === 'auto' && pendingRecommendation) {
      try {
        const result = await executeRecommendation(pendingRecommendation);
        logger.info('Auto-executed recommendation', {
          action: pendingRecommendation.action,
          signatures: result.signatures,
        });
        pendingRecommendation = null;
      } catch (err) {
        logger.error('Auto-execution failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    logger.error('Scheduler tick failed', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
}
```

- [ ] **Step 4: Add `executeRecommendation` helper**

Inside `createScheduler`, add before the `tick` function:

```typescript
async function executeRecommendation(rec: PendingRecommendation): Promise<{ signatures: string[] }> {
  const signatures: string[] = [];

  if (rec.action === 'deposit') {
    const { tx } = await config.lendingManager.buildOptimalDepositTx(rec.tokenSymbol, rec.amountRaw);
    const sig = await config.solana.sendAndConfirm(tx);
    signatures.push(sig);
  } else if (rec.action === 'withdraw') {
    const txs = await config.lendingManager.buildOptimalWithdrawTxs(rec.tokenSymbol, rec.amountRaw);
    for (const { tx } of txs) {
      const sig = await config.solana.sendAndConfirm(tx);
      signatures.push(sig);
    }
  }

  return { signatures };
}
```

- [ ] **Step 5: Add the new methods to the returned handle**

Add to the return object in `createScheduler`:

```typescript
getExecutionMode() {
  return executionMode;
},

setExecutionMode(mode: ExecutionMode) {
  executionMode = mode;
  logger.info('Execution mode changed', { mode });
},

getPendingRecommendation() {
  return pendingRecommendation;
},

async executePendingRecommendation() {
  if (!pendingRecommendation) {
    throw new Error('No pending recommendation to execute');
  }
  const result = await executeRecommendation(pendingRecommendation);
  pendingRecommendation = null;
  return result;
},
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/core/scheduler.ts
git commit -m "feat: add execution mode toggle and pending recommendation to scheduler"
```

---

## Task 5: Add new API endpoints and update `/state`

**Files:**
- Modify: `src/api.ts`
- Modify: `src/index.ts`
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Update `ApiDeps` interface in `api.ts`**

Add execution methods to `ApiDeps` (line 56-61):

```typescript
interface ApiDeps {
  getState: () => TreasuryState;
  getLastDecision: () => unknown;
  getExecutionMode: () => 'auto' | 'manual';
  setExecutionMode: (mode: 'auto' | 'manual') => void;
  getPendingRecommendation: () => unknown;
  executePendingRecommendation: () => Promise<{ signatures: string[] }>;
  lendingManager: LendingManager;
  paymentService: PaymentService;
}
```

- [ ] **Step 2: Update `GET /state` response to include `tokenBalances` and `executionMode`**

In the `GET /state` handler, update the response object:

```typescript
app.get("/state", (c: Context) => {
  const s = deps.getState();

  return c.json({
    liquidUsdc: s.usdcBalance.toFixed(6),
    liquidUsdcFormatted: fmtUsdc(s.usdcBalance),
    kaminoDeposited: s.kaminoUsdcBalance.toFixed(6),
    kaminoDepositedFormatted: fmtUsdc(s.kaminoUsdcBalance),
    totalUsdc: s.totalUsdcExposure.toFixed(6),
    totalUsdcFormatted: fmtUsdc(s.totalUsdcExposure),
    pendingObligations: s.pendingPaymentsTotal.toFixed(6),
    lastUpdatedAt: s.lastUpdatedAt,
    lastDecision: deps.getLastDecision(),
    totalLiquid: s.usdcBalance.toFixed(6),
    totalDeployed: s.kaminoUsdcBalance.toFixed(6),
    totalAum: s.totalUsdcExposure.toFixed(6),
    tokenBalances: s.tokenBalances,
    executionMode: deps.getExecutionMode(),
    pendingRecommendation: (() => {
      const rec = deps.getPendingRecommendation() as { amountRaw: bigint } | null;
      if (!rec) return null;
      return { ...rec, amountRaw: rec.amountRaw.toString() };
    })(),
    positions: [],
  });
});
```

- [ ] **Step 3: Add `POST /settings/execution-mode` endpoint**

After the health check route:

```typescript
app.post("/settings/execution-mode", async (c: Context) => {
  try {
    const body = await c.req.json() as Record<string, unknown>;
    const mode = body.mode;
    if (mode !== 'auto' && mode !== 'manual') {
      return c.json({ error: 'mode must be "auto" or "manual"' }, 400);
    }
    deps.setExecutionMode(mode);
    return c.json({ mode });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
```

- [ ] **Step 4: Add `POST /execute` endpoint**

```typescript
app.post("/execute", async (c: Context) => {
  if (deps.getExecutionMode() === 'auto') {
    return c.json({ error: 'Cannot manually execute in auto mode' }, 400);
  }
  try {
    const result = await deps.executePendingRecommendation();
    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
```

- [ ] **Step 5: Update `createApi` call in `index.ts`**

In `src/index.ts` (lines 100-105), add the new deps:

```typescript
const api = createApi({
  getState: () => scheduler!.getState(),
  getLastDecision: () => scheduler!.getLastDecision(),
  getExecutionMode: () => scheduler!.getExecutionMode(),
  setExecutionMode: (mode) => scheduler!.setExecutionMode(mode),
  getPendingRecommendation: () => scheduler!.getPendingRecommendation(),
  executePendingRecommendation: () => scheduler!.executePendingRecommendation(),
  lendingManager,
  paymentService,
});
```

- [ ] **Step 6: Add proxy entries for new endpoints in `vite.config.ts`**

In `frontend/vite.config.ts`, add to the proxy object:

```typescript
'/settings': 'http://localhost:3000',
'/execute': 'http://localhost:3000',
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/api.ts src/index.ts frontend/vite.config.ts
git commit -m "feat: add execution-mode and execute endpoints, update /state response"
```

---

## Task 6: Frontend — types and hooks

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/hooks.ts`

- [ ] **Step 1: Update `TreasuryStateResponse` type**

In `frontend/src/api/types.ts`, add fields to `TreasuryStateResponse`:

```typescript
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
```

- [ ] **Step 2: Add mutation hooks**

In `frontend/src/api/hooks.ts`, add:

```typescript
export function useSetExecutionMode() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async (mode: 'auto' | 'manual') => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<{ mode: string }>('/settings/execution-mode', { mode });
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutate, loading, error };
}

export function useExecute() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<{ signatures: string[] }>('/execute');
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutate, loading, error };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/hooks.ts
git commit -m "feat: add frontend types and hooks for token balances and execution"
```

---

## Task 7: Frontend — BalanceSheet component

**Files:**
- Create: `frontend/src/components/BalanceSheet.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Card, CardHeader, CardTitle } from './ui/Card';
import { fmtUsdc } from '../lib/format';

const STABLECOIN_ORDER = ['USDC', 'USDT', 'USDS', 'PYUSD', 'USDG', 'USD1'] as const;

const STABLECOIN_NAMES: Record<string, string> = {
  USDC: 'USD Coin',
  USDT: 'Tether USD',
  USDS: 'Sky Dollar',
  PYUSD: 'PayPal USD',
  USDG: 'Global Dollar',
  USD1: 'USD1',
};

export function BalanceSheet({ balances }: { balances: Record<string, number> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stablecoin Balances</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="pb-2 font-medium">Token</th>
              <th className="pb-2 font-medium text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {STABLECOIN_ORDER.map((symbol) => {
              const balance = balances[symbol] ?? 0;
              return (
                <tr key={symbol} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-text-primary">{symbol}</span>
                      <span className="text-text-muted text-xs">{STABLECOIN_NAMES[symbol]}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right font-mono text-text-primary">
                    {fmtUsdc(balance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/BalanceSheet.tsx
git commit -m "feat: add BalanceSheet component for per-stablecoin display"
```

---

## Task 8: Frontend — Dashboard updates

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Update imports**

Add to the imports at the top of `Dashboard.tsx`:

```typescript
import { BalanceSheet } from '../components/BalanceSheet';
import { useSetExecutionMode, useExecute } from '../api/hooks';
```

- [ ] **Step 2: Change "Available USDC" to "Available USD"**

In the metric cards section, change the first `MetricCard`:

```tsx
// Before:
<MetricCard label="Available USDC" value={fmtUsdc(liquid)} icon={DollarSign} />

// After — compute totalLiquid from tokenBalances:
```

Add this above the return statement, after `const decision = ...`:

```typescript
const tokenBalances = state?.tokenBalances ?? {};
const totalLiquidUsd = Object.values(tokenBalances).reduce((sum, v) => sum + v, 0);
```

Then update the metric card:

```tsx
<MetricCard label="Available USD" value={fmtUsdc(totalLiquidUsd)} icon={DollarSign} />
```

- [ ] **Step 3: Add BalanceSheet below metric cards**

After the metric cards `</div>`, add:

```tsx
{/* Stablecoin balance sheet */}
<BalanceSheet balances={tokenBalances} />
```

- [ ] **Step 4: Add execution toggle and button to Policy Engine card**

Add hooks inside the `Dashboard` component:

```typescript
const { mutate: setMode, loading: modeLoading } = useSetExecutionMode();
const { mutate: executeAction, loading: executeLoading } = useExecute();
const currentMode = state?.executionMode ?? 'manual';
const pendingRec = state?.pendingRecommendation;
```

At the top of the Policy Engine card (inside the `<Card className="lg:col-span-2">`), after `<CardTitle>Policy Engine</CardTitle>`, add:

```tsx
<CardHeader>
  <div className="flex items-center justify-between">
    <CardTitle>Policy Engine</CardTitle>
    <button
      onClick={() => setMode(currentMode === 'auto' ? 'manual' : 'auto').then(() => refetch())}
      disabled={modeLoading}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        currentMode === 'auto' ? 'bg-teal' : 'bg-bg-surface'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          currentMode === 'auto' ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
  <p className="text-xs text-text-muted mt-1">
    {currentMode === 'auto' ? 'Auto-executing' : 'Manual approval'}
  </p>
</CardHeader>
```

Note: This replaces the existing `<CardHeader>` for the Policy Engine card. Remove the duplicate.

- [ ] **Step 5: Add Execute button for manual mode**

Inside the Policy Engine decision section (after the decision badge block, around line 145), add:

```tsx
{/* Execute button (manual mode only) */}
{currentMode === 'manual' && pendingRec && (
  <div className="space-y-2">
    <p className="text-xs text-text-muted">Pending Action</p>
    <Button
      onClick={() => executeAction().then(() => refetch())}
      loading={executeLoading}
      variant="primary"
      size="sm"
    >
      Execute {pendingRec.action === 'deposit' ? 'Deposit' : 'Withdrawal'} — {fmtUsdc(pendingRec.amountHuman)}
    </Button>
  </div>
)}
```

- [ ] **Step 6: Verify frontend builds**

Run from `frontend/`: `npm run build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat: dashboard shows Available USD, balance sheet, and execution toggle"
```

---

## Task 9: Update .env and smoke test

**Files:**
- Modify: `.env`

- [ ] **Step 1: Update `.env` with comma-separated Kamino markets**

```
KAMINO_MARKET_ADDRESS=7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF,A1USdzqDHmw5oz97AkqAGLxEQZfFjASZFuy4T6Qdvnpo
KAMINO_MARKET_LABELS=Main,Allez
```

- [ ] **Step 2: Kill any running backend, start fresh**

```bash
# Find and kill any process on port 3000
netstat -ano | grep ":3000" | grep LISTEN
# taskkill //F //PID <pid>
npm run dev
```

- [ ] **Step 3: Verify `/state` response includes new fields**

```bash
curl -s http://localhost:3000/state | node -e "
  const fs = require('fs');
  const j = JSON.parse(fs.readFileSync('/dev/stdin','utf8'));
  console.log('tokenBalances:', j.tokenBalances);
  console.log('executionMode:', j.executionMode);
  console.log('pendingRecommendation:', j.pendingRecommendation);
"
```

Expected: `tokenBalances` has all 6 stablecoins, `executionMode` is `"manual"`, `pendingRecommendation` is null or an object.

- [ ] **Step 4: Verify `/lending` shows both Kamino markets**

```bash
curl -s http://localhost:3000/lending
```

Expected: Positions from both "Kamino Lend (Main)" and "Kamino Lend (Allez)" adapters appear.

- [ ] **Step 5: Test execution mode toggle**

```bash
curl -s -X POST http://localhost:3000/settings/execution-mode -H 'Content-Type: application/json' -d '{"mode":"auto"}'
```

Expected: `{"mode":"auto"}`

```bash
curl -s -X POST http://localhost:3000/settings/execution-mode -H 'Content-Type: application/json' -d '{"mode":"manual"}'
```

Expected: `{"mode":"manual"}`

- [ ] **Step 6: Start frontend dev server and visually verify**

From `frontend/`: `npm run dev`

Open `http://localhost:5173/app` and verify:
- "Available USD" shows sum of all stablecoins (should show ~$7.00 from USDC)
- Balance sheet below metrics shows all 6 stablecoins with USDC at ~$7.00 and others at $0.00
- Policy Engine card has auto/manual toggle (defaults to Manual)
- Toggle works — switching to Auto and back

- [ ] **Step 7: Done**

Note: `.env` is gitignored — the Kamino market changes are local-only and do not need a commit.
