# StableDesk

Autonomous institutional stablecoin treasury agent on Solana. Manages idle stablecoins across multiple yield protocols, handles payment execution, and enforces compliance — with zero SOL exposure via Kora gas abstraction.

## The Problem

Corporate treasuries holding stablecoins on Solana face a three-way tradeoff: keep funds liquid for payments, deploy to yield, or hold reserves. Today this is managed manually — spreadsheets, manual deposits across lending protocols, manual transfers, and the absurd requirement of holding volatile SOL just to pay gas fees. Every action is slow, error-prone, and unauditable.

## What StableDesk Does

A single autonomous agent that manages an institutional stablecoin treasury end-to-end:

**Multi-protocol yield optimization.** Idle stablecoins automatically flow into the highest-yielding lending protocol. The agent compares supply APYs across Kamino Lend, marginfi, Save (Solend), and Jupiter Lend in real-time, routing deposits to the best rate and withdrawing from the lowest-yielding position first when liquidity is needed.

**Multi-token support.** The treasury manages a diversified stablecoin portfolio — not just USDC. All supported stablecoins are treated as first-class assets for holding, lending, and payments.

**Payment execution.** The institution queues payment obligations via the REST API or dashboard. The agent validates each payment against the liquidity policy, builds the SPL token transfer, and executes it. Payments that would breach the minimum reserve are rejected.

**Kora as the compliance perimeter.** The Kora fee-payer node enforces a security boundary at the infrastructure level:

- `allowed_programs` — only SPL Token, Token-2022, Kamino, marginfi, Save, Jupiter Perps, and ATA programs. The agent literally cannot call anything else.
- `allowed_tokens` — only whitelisted stablecoin mints. No volatile asset exposure.
- `disallowed_accounts` — OFAC-sanctioned or blocked counterparties.
- `max_allowed_lamports` — caps per-transaction fee spend.
- Usage limits — daily transaction caps per wallet.

The compliance officer configures `kora.toml` once. The agent operates freely within those constraints. Even if the agent has a bug, Kora prevents catastrophic actions — defense in depth at the signing layer, not the application layer.

## Supported Assets

| Token | Name | Mint | Token Program | Status |
|-------|------|------|---------------|--------|
| **USDC** | USD Coin | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | SPL Token | Enabled |
| **USDT** | Tether USD | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | SPL Token | Enabled |
| **USDS** | USDS (Sky Dollar) | `USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA` | SPL Token | Enabled |
| **PYUSD** | PayPal USD | `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo` | Token-2022 | Enabled |
| **USDG** | Global Dollar (Paxos) | `2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH` | Token-2022 | Enabled |
| **USD1** | USD1 (World Liberty Financial) | `USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB` | SPL Token | Enabled |
| **CASH** | CASH (Cashio — defunct) | `CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH` | SPL Token | Disabled |

## Supported Lending Protocols

| Protocol | Program ID | SDK | Supported Tokens |
|----------|-----------|-----|------------------|
| **Kamino Lend** | `KLend2g3cP87ber8LQi2Hb89NVzs8TmWKkSKH3sXbQ4` | `@kamino-finance/klend-sdk` v7 + `@solana/kit` | USDC, USDT, USDS, PYUSD |
| **marginfi** | `MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA` | `@mrgnlabs/marginfi-client-v2` + `@mrgnlabs/mrgn-common` | USDC, USDT, USDS, PYUSD |
| **Save (Solend)** | `So1endDq2YkqhipRh3WViPa8hFvz7yJdFptquMheVo6` | `@solendprotocol/solend-sdk` | USDC, USDT |
| **Jupiter Lend** | `PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu` | `@jup-ag/lend` + `@jup-ag/lend-read` | USDC, USDT |

All protocol SDKs are optional dependencies — if a SDK is not installed, that adapter gracefully degrades and the system continues with the remaining protocols.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard (localhost:3000)                │
│         Treasury state, multi-token balances, lending        │
│           positions, payments, audit log, ring chart         │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API (Hono)
┌──────────────────────────┴──────────────────────────────────┐
│  GET /state  GET /payments  POST /payments  GET /audit      │
│  GET /lending  GET /lending/best-apy/:token  GET /health    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                      Scheduler (tick loop)                   │
│                                                             │
│   Every N seconds:                                          │
│   1. Refresh state ─── fetch all token balances + positions │
│   2. Evaluate policy ─ compare against thresholds           │
│   3. Rebalance ─────── deposit to best APY / withdraw from  │
│                         lowest APY across all protocols      │
│   4. Process payments ─ execute pending stablecoin transfers │
│   5. Audit ──────────── log every action taken              │
└────┬──────────┬──────────────┬──────────┬──────────────────┘
     │          │              │          │
     ▼          ▼              ▼          ▼
┌─────────┐ ┌────────┐ ┌──────────────────────┐ ┌──────────┐
│ Solana  │ │ Token  │ │   Lending Manager    │ │   Kora   │
│ Client  │ │ Client │ │                      │ │  Client  │
│         │ │        │ │  ┌───────┐ ┌───────┐ │ │          │
│ web3.js │ │  SPL   │ │  │Kamino │ │marginfi│ │ │@solana/  │
│ keypair │ │ token  │ │  └───────┘ └───────┘ │ │  kora    │
│ confirm │ │ ATA    │ │  ┌───────┐ ┌───────┐ │ │ sign &   │
│         │ │ xfer   │ │  │ Save  │ │JupLend│ │ │ send tx  │
└────┬────┘ └───┬────┘ │  └───────┘ └───────┘ │ └────┬─────┘
     │          │      └──────────┬───────────┘      │
     └──────────┴────────────────┴───────────────────┘
                        │
                  Solana RPC
              (devnet / mainnet)
```

### Component Map

```
src/
├── index.ts                    # Bootstrap: wires all components, starts scheduler + API
├── api.ts                      # Hono REST API (8 endpoints) + dashboard serving
├── config/
│   ├── env.ts                  # Validated environment variable loading
│   ├── policy.ts               # Treasury policy: reserve thresholds, allocation targets
│   └── stablecoins.ts          # Stablecoin registry: mints, decimals, token programs
├── core/
│   ├── treasury-state.ts       # TreasuryState: multi-token balances, per-protocol positions
│   ├── liquidity-policy.ts     # evaluatePolicy() → deposit/withdraw/none + payment gating
│   └── scheduler.ts            # Tick loop: refresh → evaluate → rebalance → process
├── integrations/
│   ├── solana.ts               # Connection, keypair, sendAndConfirm (legacy + versioned)
│   ├── usdc.ts                 # Multi-token balance fetch, SPL transfer builder, auto-ATA
│   ├── kora.ts                 # @solana/kora SDK — gasless tx relay, fallback to direct
│   └── lending/
│       ├── types.ts            # LendingAdapter interface, LendingPosition, LendingPortfolio
│       ├── kamino-adapter.ts   # Kamino Lend via @kamino-finance/klend-sdk + @solana/kit
│       ├── marginfi-adapter.ts # marginfi via @mrgnlabs/marginfi-client-v2
│       ├── save-adapter.ts     # Save (Solend) via @solendprotocol/solend-sdk
│       ├── juplend-adapter.ts  # Jupiter Lend via @jup-ag/lend + @jup-ag/lend-read
│       ├── manager.ts          # LendingManager: aggregation, yield-optimized routing
│       └── index.ts            # Barrel export
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
    ├── show-state.ts           # CLI: print treasury balances + lending positions
    └── create-payment.ts       # CLI: create and process a payment
```

### Data Flow

**On each scheduler tick:**

1. **Refresh** — Parallel fetch: all stablecoin wallet balances (`spl-token`), lending positions across all protocols, current slot, pending payment sum.
2. **Evaluate** — Compare state against policy thresholds:
   - Liquid below minimum? → Recommend withdrawal (from lowest-APY protocol first).
   - Excess liquid above target? → Recommend deposit (to highest-APY protocol).
   - Otherwise → Hold.
3. **Rebalance** — Build deposit/withdraw transaction via the Lending Manager's yield-optimized router, send through Kora (gasless) or direct.
4. **Process payments** — For each pending payment: validate liquidity, build SPL transfer, send through Kora, update status.
5. **Audit** — Every action (rebalance, payment, tick) is recorded with actor, params, result, and timestamp.

### Yield-Optimized Routing

The Lending Manager (`src/integrations/lending/manager.ts`) aggregates all protocol adapters and routes capital for optimal yield:

- **Deposits** → routed to the protocol offering the highest supply APY for the given token
- **Withdrawals** → pulled from the protocol with the lowest supply APY first (minimizing opportunity cost)
- **Multi-protocol cascade** — if a single protocol can't satisfy a withdrawal, the manager cascades across multiple protocols until the full amount is covered

### Policy Engine

The liquidity policy (`src/core/liquidity-policy.ts`) makes two decisions:

**Rebalancing:** Should we move stablecoins between the wallet and lending protocols?
- If `liquid < minLiquidReserve` → withdraw from lowest-APY protocol up to `targetLiquidReserve`
- If `liquid > targetLiquidReserve` and lending allocation is below target % → deposit excess to highest-APY protocol
- Dust threshold: deposits under 1 USDC are skipped

**Payment gating:** Can this payment be approved?
- Amount must be ≤ `maxSingleTransactionUsdc`
- Available liquidity = `liquid - minLiquidReserve - pendingObligations`
- Recipient must not be in the blocklist

Default policy values (configurable in `src/config/policy.ts`):

| Parameter | Default | Description |
|---|---|---|
| `minLiquidReserveUsdc` | 500 USDC | Minimum liquid balance before withdrawing |
| `targetLiquidReserveUsdc` | 1,000 USDC | Target liquid balance after rebalancing |
| `maxSingleTransactionUsdc` | 50,000 USDC | Max single outgoing payment |
| `kaminoTargetAllocationPct` | 80% | Target % of total AUM deployed to lending |
| `dailySpendingCapUsdc` | Unlimited | Daily spending limit |
| `disallowedRecipients` | [] | Blocked addresses |

### Kora: Defense in Depth

Kora is **not** the policy engine — the TypeScript agent is. Kora is the **security perimeter**: a second layer that prevents the agent from doing anything outside the allowed set, even if the application code has a bug.

```
  Application layer (TypeScript)     Infrastructure layer (Kora)
  ─────────────────────────────     ──────────────────────────────
  "Should we deposit 5000 USDC      "Is this transaction calling
   to the best-APY protocol?"        an allowed program?"

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

### Optional SDK Dependencies

Install the SDKs for the lending protocols you want to use:

```bash
# Kamino Lend (requires @solana/kit for v7 compatibility)
npm install @kamino-finance/klend-sdk @solana/kit

# marginfi
npm install @mrgnlabs/marginfi-client-v2 @mrgnlabs/mrgn-common

# Save (Solend)
npm install @solendprotocol/solend-sdk

# Jupiter Lend
npm install @jup-ag/lend @jup-ag/lend-read bn.js
```

Each adapter gracefully degrades if its SDK is not installed — the system always works with whatever protocols are available.

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
| `npm run show-state` | Fetch and print treasury balances + lending positions |
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
| `GET` | `/lending` | All lending positions across all protocols |
| `GET` | `/lending/best-apy/:token` | Best APY for a token across all protocols |
| `GET` | `/audit` | Query audit log (filter: `?action=X&since=ISO`) |

## Tech Stack

- **Runtime:** Node.js 20+, TypeScript (strict), ES modules
- **Solana:** `@solana/web3.js` v1 (connection, transactions) + `@solana/kit` v2 (Kamino SDK compatibility)
- **SPL Token:** `@solana/spl-token` — multi-token balance queries, transfers, ATA management
- **Kamino:** `@kamino-finance/klend-sdk` v7 — lending deposits, withdrawals, position tracking
- **marginfi:** `@mrgnlabs/marginfi-client-v2` — bank model lending, `getBankByTokenSymbol`, `computeInterestRates`
- **Save:** `@solendprotocol/solend-sdk` — `SolendMarket`, `SolendAction` for deposits/withdrawals
- **Jupiter Lend:** `@jup-ag/lend` + `@jup-ag/lend-read` — `getDepositIxs`/`getWithdrawIxs`, position reads
- **Kora:** `@solana/kora` — gasless transaction relay via fee-payer co-signing
- **API:** Hono + `@hono/node-server` — lightweight HTTP server
- **Testing:** Vitest
- **Dashboard:** Single HTML file, vanilla JS, zero build step
