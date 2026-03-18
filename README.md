# StableDesk

Autonomous institutional stablecoin treasury agent on Solana. Manages idle USDC across yield, payments, and compliance — with zero SOL exposure via Kora gas abstraction.

## The Problem

Corporate treasuries holding stablecoins on Solana face a three-way tradeoff: keep funds liquid for payments, deploy to yield, or hold reserves. Today this is managed manually — spreadsheets, manual Kamino deposits, manual transfers, and the absurd requirement of holding volatile SOL just to pay gas fees. Every action is slow, error-prone, and unauditable.

## What StableDesk Does

A single autonomous agent that manages an institutional stablecoin treasury end-to-end:

**Yield optimization.** Idle USDC automatically flows into Kamino Lend vaults. The agent monitors balances, rebalances allocations based on a configurable risk policy, and withdraws when liquidity is needed — pulling from the lowest-priority position first.

**Payment execution.** The institution queues payment obligations via the REST API or dashboard. The agent validates each payment against the liquidity policy, builds the SPL token transfer, and executes it. Payments that would breach the minimum reserve are rejected.

**Kora as the compliance perimeter.** The Kora fee-payer node enforces a security boundary at the infrastructure level:

- `allowed_programs` — only SPL Token, Kamino Lending, and ATA programs. The agent literally cannot call anything else.
- `allowed_tokens` — only whitelisted stablecoins (USDC). No volatile asset exposure.
- `disallowed_accounts` — OFAC-sanctioned or blocked counterparties.
- `max_allowed_lamports` — caps per-transaction fee spend.
- Usage limits — daily transaction caps per wallet.

The compliance officer configures `kora.toml` once. The agent operates freely within those constraints. Even if the agent has a bug, Kora prevents catastrophic actions — defense in depth at the signing layer, not the application layer.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard (localhost:3000)                │
│           Single-page HTML — treasury state, payments,      │
│              audit log, ring chart, payment form             │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API (Hono)
┌──────────────────────────┴──────────────────────────────────┐
│  GET /state  GET /payments  POST /payments  GET /audit  ... │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                      Scheduler (tick loop)                   │
│                                                             │
│   Every N seconds:                                          │
│   1. Refresh state ─── fetch USDC balance + Kamino position │
│   2. Evaluate policy ─ compare against thresholds           │
│   3. Rebalance ─────── deposit to / withdraw from Kamino    │
│   4. Process payments ─ execute pending USDC transfers      │
│   5. Audit ──────────── log every action taken              │
└────┬───────────┬──────────────┬────────────┬────────────────┘
     │           │              │            │
     ▼           ▼              ▼            ▼
┌─────────┐ ┌────────┐ ┌────────────┐ ┌──────────┐
│ Solana  │ │  USDC  │ │   Kamino   │ │   Kora   │
│ Client  │ │ Client │ │   Client   │ │  Client  │
│         │ │        │ │            │ │          │
│ web3.js │ │  SPL   │ │ klend-sdk  │ │@solana/  │
│ keypair │ │ token  │ │ @solana/kit│ │  kora    │
│ confirm │ │ ATA    │ │ deposit/   │ │ sign &   │
│         │ │ xfer   │ │ withdraw   │ │ send tx  │
└────┬────┘ └───┬────┘ └─────┬──────┘ └────┬─────┘
     │          │             │             │
     └──────────┴─────────────┴─────────────┘
                        │
                  Solana RPC
              (devnet / mainnet)
```

### Component Map

```
src/
├── index.ts                    # Bootstrap: wires all components, starts scheduler + API
├── api.ts                      # Hono REST API (6 endpoints) + dashboard serving
├── config/
│   ├── env.ts                  # Validated environment variable loading
│   └── policy.ts               # Treasury policy: reserve thresholds, allocation targets
├── core/
│   ├── treasury-state.ts       # TreasuryState type: liquid, deployed, total, obligations
│   ├── liquidity-policy.ts     # evaluatePolicy() → deposit/withdraw/none + payment gating
│   └── scheduler.ts            # Tick loop: refresh → evaluate → rebalance → process
├── integrations/
│   ├── solana.ts               # Connection, keypair, sendAndConfirm (legacy + versioned)
│   ├── usdc.ts                 # Balance fetch, SPL transfer builder, auto-ATA creation
│   ├── kamino.ts               # KaminoMarket + KaminoAction via klend-sdk / @solana/kit
│   └── kora.ts                 # @solana/kora SDK — gasless tx relay, fallback to direct
├── payments/
│   ├── payment-types.ts        # PaymentRequest, PaymentRecord, PaymentStatus
│   ├── payment-store.ts        # In-memory Map store with status transitions
│   └── payment-service.ts      # Create, validate, execute, audit payments
├── audit/
│   ├── logger.ts               # Structured JSON logger (debug/info/warn/error)
│   └── audit-service.ts        # Immutable append-only event log with query interface
├── public/
│   └── index.html              # Treasury dashboard (single-file, zero dependencies)
└── scripts/
    ├── run-scheduler.ts        # CLI: start the agent
    ├── show-state.ts           # CLI: print treasury balances
    └── create-payment.ts       # CLI: create and process a payment
```

### Data Flow

**On each scheduler tick:**

1. **Refresh** — Parallel fetch: USDC wallet balance (`spl-token`), Kamino position (`klend-sdk`), current slot, pending payment sum.
2. **Evaluate** — Compare state against policy thresholds:
   - Liquid below minimum? → Recommend withdrawal from Kamino.
   - Excess liquid above target? → Recommend deposit to Kamino (up to target allocation %).
   - Otherwise → Hold.
3. **Rebalance** — Build deposit/withdraw transaction via Kamino, send through Kora (gasless) or direct.
4. **Process payments** — For each pending payment: validate liquidity, build SPL transfer, send through Kora, update status.
5. **Audit** — Every action (rebalance, payment, tick) is recorded with actor, params, result, and timestamp.

### Policy Engine

The liquidity policy (`src/core/liquidity-policy.ts`) makes two decisions:

**Rebalancing:** Should we move USDC between the wallet and Kamino?
- If `liquidUsdc < minLiquidReserve` → withdraw from Kamino up to `targetLiquidReserve`
- If `liquidUsdc > targetLiquidReserve` and Kamino allocation is below target % → deposit excess
- Dust threshold: deposits under 1 USDC are skipped

**Payment gating:** Can this payment be approved?
- Amount must be ≤ `maxSingleTransactionUsdc`
- Available liquidity = `liquidUsdc - minLiquidReserve - pendingObligations`
- Recipient must not be in the blocklist

Default policy values (configurable in `src/config/policy.ts`):

| Parameter | Default | Description |
|---|---|---|
| `minLiquidReserveUsdc` | 500 USDC | Minimum liquid balance before withdrawing from Kamino |
| `targetLiquidReserveUsdc` | 1,000 USDC | Target liquid balance after rebalancing |
| `maxSingleTransactionUsdc` | 50,000 USDC | Max single outgoing payment |
| `kaminoTargetAllocationPct` | 80% | Target % of total AUM deployed to Kamino |
| `dailySpendingCapUsdc` | Unlimited | Daily spending limit |
| `disallowedRecipients` | [] | Blocked addresses |

### Kora: Defense in Depth

Kora is **not** the policy engine — the TypeScript agent is. Kora is the **security perimeter**: a second layer that prevents the agent from doing anything outside the allowed set, even if the application code has a bug.

```
  Application layer (TypeScript)     Infrastructure layer (Kora)
  ─────────────────────────────     ──────────────────────────────
  "Should we deposit 5000 USDC      "Is this transaction calling
   to Kamino right now?"              an allowed program?"

  "Does this payment pass            "Is the recipient on the
   liquidity policy?"                  blocked list?"

  "What's the optimal                "Does this transaction exceed
   rebalancing amount?"                the max lamport cap?"
```

The `kora.toml` file at the project root is the operator-side configuration. See [`kora.toml`](./kora.toml) for the full config.

## Getting Started

```bash
npm install
cp .env.example .env
# Edit .env with your Solana RPC URL and treasury keypair
npm run dev
```

Open `http://localhost:3000` for the dashboard.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SOLANA_RPC_URL` | Yes | — | Solana RPC endpoint |
| `TREASURY_KEYPAIR` | Yes | — | Base58 private key or JSON array |
| `USDC_MINT_ADDRESS` | Yes | — | USDC token mint address |
| `KAMINO_MARKET_ADDRESS` | No | — | Kamino lending market address |
| `KAMINO_PROGRAM_ID` | No | — | Kamino program ID (uses default if empty) |
| `KORA_ENDPOINT` | No | — | Kora relay URL (empty = direct signing) |
| `KORA_API_KEY` | No | — | Kora authentication key |
| `KORA_FEE_TOKEN` | No | — | Token mint for Kora fee payment |
| `SCHEDULER_INTERVAL_SECONDS` | No | 60 | Rebalancing tick interval |
| `LOG_LEVEL` | No | info | debug / info / warn / error |
| `PORT` | No | 3000 | API server port |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start scheduler + API + dashboard with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm test` | Run Vitest test suite |
| `npm run typecheck` | Type-check without emitting |
| `npm run show-state` | Fetch and print treasury balances |
| `npm run create-payment -- <addr> <amount> [memo]` | Create and process a payment via CLI |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Treasury dashboard |
| `GET` | `/health` | Health check |
| `GET` | `/state` | Treasury state + last policy decision |
| `GET` | `/payments` | List payments (filter: `?status=pending`) |
| `POST` | `/payments` | Create a payment `{ recipient, amountUsdc, memo? }` |
| `POST` | `/payments/:id/process` | Force-process a pending payment |
| `GET` | `/audit` | Query audit log (filter: `?action=X&since=ISO`) |

## Tech Stack

- **Runtime:** Node.js 20+, TypeScript (strict), ES modules
- **Solana:** `@solana/web3.js` v1 (connection, transactions) + `@solana/kit` v2 (Kamino SDK compatibility)
- **SPL Token:** `@solana/spl-token` — USDC balance, transfers, ATA management
- **Kamino:** `@kamino-finance/klend-sdk` v7 — lending deposits, withdrawals, position tracking
- **Kora:** `@solana/kora` — gasless transaction relay via fee-payer co-signing
- **API:** Hono + `@hono/node-server` — lightweight HTTP server
- **Testing:** Vitest
- **Dashboard:** Single HTML file, vanilla JS, zero build step
