# StableDesk Setup Guide

Complete setup and deployment guide for the StableDesk autonomous stablecoin treasury agent.

---

## Prerequisites

- **Node.js** 20 or later
- **npm** (comes with Node.js)
- A **Solana RPC endpoint** (devnet for testing, mainnet for production)
- A **funded treasury wallet** keypair (base58 private key or JSON byte array)

---

## 1. Install Dependencies

```bash
git clone <repo-url> && cd Stabledesk
npm install
```

This installs the core dependencies:

| Package | Purpose |
|---------|---------|
| `@solana/web3.js` | Solana connection, transactions, keypair handling |
| `@solana/spl-token` | SPL token transfers, ATA management, balance queries |
| `@kamino-finance/klend-sdk` | Kamino Lend integration (deposit/withdraw/positions) |
| `@solana/kora` | Gasless transaction relay via Kora fee-payer |
| `hono` + `@hono/node-server` | REST API server |
| `bs58` | Base58 encoding for keypairs |
| `dotenv` | `.env` file loading |

### Optional: Lending Protocol SDKs

Each lending protocol adapter dynamically imports its SDK. If a SDK is not installed, that protocol gracefully degrades — the system continues with whatever protocols are available.

```bash
# Kamino Lend (requires @solana/kit for klend-sdk v7 compatibility)
npm install @kamino-finance/klend-sdk @solana/kit

# marginfi
npm install @mrgnlabs/marginfi-client-v2 @mrgnlabs/mrgn-common

# Save (formerly Solend)
npm install @solendprotocol/solend-sdk

# Jupiter Lend
npm install @jup-ag/lend @jup-ag/lend-read bn.js
```

You do not need all four — install only the protocols you intend to use. The Lending Manager routes deposits to the highest-APY protocol among those available.

---

## 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SOLANA_RPC_URL` | Solana RPC endpoint | `https://api.devnet.solana.com` |
| `TREASURY_KEYPAIR` | Treasury wallet private key (base58 string **or** JSON byte array) | `5K1gE...` or `[12,34,56,...]` |
| `USDC_MINT_ADDRESS` | USDC mint on the target cluster | Devnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` / Mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KAMINO_MARKET_ADDRESS` | _(empty)_ | Kamino lending market address. If empty, Kamino adapter is not registered. Main market: `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF` |
| `KAMINO_PROGRAM_ID` | _(SDK default)_ | Kamino program ID override |
| `KORA_ENDPOINT` | _(empty)_ | Kora relay URL. If empty, transactions are signed directly (requires SOL for gas) |
| `KORA_API_KEY` | _(empty)_ | Kora authentication key |
| `KORA_FEE_TOKEN` | _(USDC_MINT_ADDRESS)_ | Token mint used to pay Kora relay fees |
| `SCHEDULER_INTERVAL_SECONDS` | `60` | How often the agent runs its tick loop (seconds) |
| `LOG_LEVEL` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `PORT` | `3000` | HTTP server port for the API and dashboard |

### Example `.env` for Devnet Testing

```
SOLANA_RPC_URL=https://api.devnet.solana.com
TREASURY_KEYPAIR=<your-base58-private-key>
USDC_MINT_ADDRESS=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
KAMINO_MARKET_ADDRESS=7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF
SCHEDULER_INTERVAL_SECONDS=30
LOG_LEVEL=debug
PORT=3000
```

### Example `.env` for Mainnet

```
SOLANA_RPC_URL=https://your-mainnet-rpc.example.com
TREASURY_KEYPAIR=<your-base58-private-key>
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
KAMINO_MARKET_ADDRESS=7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF
KORA_ENDPOINT=https://your-kora-node.example.com
KORA_API_KEY=<your-kora-api-key>
SCHEDULER_INTERVAL_SECONDS=60
LOG_LEVEL=info
PORT=3000
```

---

## 3. Generate a Treasury Keypair

If you don't have a keypair yet:

```bash
# Using Solana CLI
solana-keygen new --outfile treasury.json --no-bip39-passphrase

# Print the base58 private key for .env
node -e "const kp = require('./treasury.json'); const bs58 = require('bs58'); console.log(bs58.encode(Buffer.from(kp)))"
```

Or generate one in Node.js:

```bash
node -e "const {Keypair} = require('@solana/web3.js'); const bs58 = require('bs58'); const kp = Keypair.generate(); console.log('Public:', kp.publicKey.toBase58()); console.log('Private:', bs58.encode(kp.secretKey))"
```

**For devnet testing**, fund the wallet:

```bash
solana airdrop 2 <your-public-key> --url devnet
```

And obtain devnet USDC from a faucet (e.g., [spl-token-faucet.com](https://spl-token-faucet.com)).

---

## 4. Run the Agent

### Development (hot reload)

```bash
npm run dev
```

This starts the full system with `tsx watch`:
- Scheduler tick loop (refresh → evaluate → rebalance → process payments)
- REST API on `http://localhost:3000`
- Dashboard at `http://localhost:3000`

### Production

```bash
npm run build
npm start
```

Compiles TypeScript to `dist/` then runs `node dist/index.js`.

---

## 5. Verify the Setup

### Check treasury state from CLI

```bash
npm run show-state
```

Prints wallet address, slot, all token balances, lending positions across protocols, and AUM totals.

### Check the dashboard

Open `http://localhost:3000` in a browser. The dashboard shows:
- Treasury overview (liquid, deployed, AUM) with a ring chart
- Current policy decision and last rebalance action
- Payments table with status badges
- Audit log feed

### Health check

```bash
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"2026-03-17T..."}
```

### Full state via API

```bash
curl http://localhost:3000/state | jq .
```

---

## 6. Treasury Policy Configuration

The agent's behavior is governed by the policy in `src/config/policy.ts`. The defaults are:

| Parameter | Default | What It Controls |
|-----------|---------|-----------------|
| `minLiquidReserveUsdc` | 500 USDC | Liquid balance floor — triggers withdrawal from lending if breached |
| `targetLiquidReserveUsdc` | 1,000 USDC | Target liquid balance after rebalancing |
| `maxSingleTransactionUsdc` | 50,000 USDC | Largest single outgoing payment allowed |
| `kaminoTargetAllocationPct` | 80% | Target % of total AUM deployed to lending protocols |
| `dailySpendingCapUsdc` | 0 (unlimited) | Daily spending limit across all payments |
| `disallowedRecipients` | `[]` | Blocked wallet addresses (OFAC, internal blocklist) |

To customize, edit the `DEFAULT_POLICY` object in `src/config/policy.ts` and restart.

### How the policy engine works

Every scheduler tick:

1. **Liquid below minimum?** → Withdraw from the lowest-APY lending protocol until `targetLiquidReserve` is reached
2. **Excess liquid above target?** → Deposit surplus into the highest-APY lending protocol (up to the allocation target %)
3. **Payment requested?** → Approved only if `liquid - minReserve - pendingObligations >= paymentAmount` and `paymentAmount <= maxSingleTransaction` and recipient is not blocklisted

---

## 7. Kora Configuration (Gasless Transactions)

Kora is the gasless transaction relay — it co-signs transactions so the treasury wallet never needs SOL. The `kora.toml` file at the project root defines the security perimeter that Kora enforces.

### Running without Kora

If `KORA_ENDPOINT` is not set, StableDesk falls back to direct signing. The treasury wallet must hold a small SOL balance for gas fees (~0.01 SOL per transaction).

### Running with Kora

1. Deploy a Kora node (see [Kora docs](https://github.com/nicoorfi/kora))
2. Set `KORA_ENDPOINT` and `KORA_API_KEY` in `.env`
3. Review `kora.toml` and adjust for your deployment:

**Key settings to review:**

```toml
[validation]
max_allowed_lamports = 100000000    # ~0.1 SOL max gas per transaction
max_signatures = 10
price_source = "Jupiter"            # Use "Mock" for devnet

# Programs the agent is allowed to call
allowed_programs = [
  "11111111111111111111111111111111",                   # System Program
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",      # SPL Token
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",      # Token-2022
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",     # Associated Token Account
  "ComputeBudget111111111111111111111111111111",        # Compute Budget
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",     # Memo
  "KLend2g3cP87ber8LQi2Hb89NVzs8TmWKkSKH3sXbQ4",     # Kamino Lending
  "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA",     # marginfi v2
  "So1endDq2YkqhipRh3WViPa8hFvz7yJdFptquMheVo6",     # Save (Solend)
  "PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu",     # Jupiter Perpetuals
]

# Token mints allowed in transactions
allowed_tokens = [
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",    # USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",    # USDT
  "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA",    # USDS
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",    # PYUSD
  "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",    # USDG
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB",     # USD1
]

# OFAC / blocked counterparties
disallowed_accounts = []
```

To add a blocked address (e.g., sanctioned wallet):

```toml
disallowed_accounts = [
  "Htp9MGP8Tig923ZFY7Qf2zzbMUmYneFRAhSp7vSg4wxV",
]
```

---

## 8. Supported Assets

StableDesk manages multiple stablecoins. The registry is in `src/config/stablecoins.ts`:

| Token | Mint Address | Token Program | Status |
|-------|-------------|---------------|--------|
| **USDC** | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | SPL Token | Enabled |
| **USDT** | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | SPL Token | Enabled |
| **USDS** | `USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA` | SPL Token | Enabled |
| **PYUSD** | `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo` | Token-2022 | Enabled |
| **USDG** | `2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH` | Token-2022 | Enabled |
| **USD1** | `USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB` | SPL Token | Enabled |
| **CASH** | `CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH` | SPL Token | Disabled (defunct) |

To add a new stablecoin, add an entry to the `STABLECOINS` record in `src/config/stablecoins.ts` and the mint to `allowed_tokens` in `kora.toml`.

---

## 9. Supported Lending Protocols

| Protocol | SDK | Supported Tokens | Notes |
|----------|-----|------------------|-------|
| **Kamino Lend** | `@kamino-finance/klend-sdk` + `@solana/kit` | USDC, USDT, USDS, PYUSD | Requires `KAMINO_MARKET_ADDRESS` in `.env` |
| **marginfi** | `@mrgnlabs/marginfi-client-v2` + `@mrgnlabs/mrgn-common` | USDC, USDT, USDS, PYUSD | Auto-creates marginfi account on first deposit |
| **Save (Solend)** | `@solendprotocol/solend-sdk` | USDC, USDT | Uses main pool by default |
| **Jupiter Lend** | `@jup-ag/lend` + `@jup-ag/lend-read` | USDC, USDT | Yield from JLP perp trading fees |

The Lending Manager automatically:
- Routes **deposits** to the protocol with the **highest supply APY** for the given token
- Routes **withdrawals** from the protocol with the **lowest supply APY** first (minimizing opportunity cost)
- Cascades across multiple protocols if a single one can't satisfy the full withdrawal amount

---

## 10. Using the API

### Create a payment

```bash
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{"recipient": "RecipientPublicKeyBase58", "amountUsdc": 100000000, "memo": "Invoice #1234"}'
```

`amountUsdc` is in micro-units (1 USDC = 1,000,000). The above sends 100 USDC.

### Force-process a pending payment

```bash
curl -X POST http://localhost:3000/payments/<payment-id>/process
```

### Create a payment via CLI

```bash
npm run create-payment -- RecipientPublicKeyBase58 100 "Invoice #1234"
```

Amount is in human-readable USDC (100 = 100 USDC).

### Query lending positions

```bash
curl http://localhost:3000/lending | jq .
```

### Find the best APY for a token

```bash
curl http://localhost:3000/lending/best-apy/USDC | jq .
# → {"protocol":"kamino","apy":0.0523}
```

### Query audit log

```bash
# All events
curl http://localhost:3000/audit | jq .

# Filter by action
curl "http://localhost:3000/audit?action=rebalance" | jq .

# Filter by time
curl "http://localhost:3000/audit?since=2026-03-17T00:00:00Z" | jq .
```

---

## 11. Running Tests

```bash
npm test
```

Tests use Vitest and cover:
- Audit service (event logging, querying)
- Liquidity policy (rebalance decisions, payment gating)
- Scheduler (tick loop, overlap protection)
- Treasury state (multi-token balance aggregation)
- Token client (balance fetch, transfer building)
- Payment service (creation, validation, processing)
- Kamino adapter (deposit/withdraw transaction building)

Type-check without running:

```bash
npm run typecheck
```

---

## 12. Deployment

### PM2

```bash
npm run build
pm2 start dist/index.js --name stabledesk
pm2 save
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
COPY src/public/ ./src/public/
COPY kora.toml ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```bash
npm run build
docker build -t stabledesk .
docker run -d --env-file .env -p 3000:3000 stabledesk
```

### Systemd

```ini
[Unit]
Description=StableDesk Treasury Agent
After=network.target

[Service]
Type=simple
User=stabledesk
WorkingDirectory=/opt/stabledesk
EnvironmentFile=/opt/stabledesk/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## 13. Startup Sequence

When the agent starts, it:

1. Loads and validates environment variables
2. Creates the Solana client (connection + keypair parsing)
3. Creates the multi-token balance client
4. Creates the Kora client (or falls back to direct signing)
5. Registers lending protocol adapters:
   - Kamino (if `KAMINO_MARKET_ADDRESS` is set)
   - marginfi, Save, Jupiter Lend (always registered; degrade if SDK missing)
6. Initializes all adapters in parallel (non-blocking — failures are logged, not fatal)
7. Creates the payment service
8. Starts the scheduler tick loop
9. Starts the HTTP server
10. Logs the wallet address and dashboard URL

Graceful shutdown on `SIGINT` / `SIGTERM`: stops the scheduler, closes the HTTP server, exits cleanly.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Error: SOLANA_RPC_URL is required` | Missing `.env` or unset variable | Copy `.env.example` to `.env` and fill in values |
| `marginfi SDK not installed — adapter will be unavailable` | Optional SDK not installed | `npm install @mrgnlabs/marginfi-client-v2 @mrgnlabs/mrgn-common` (or ignore if you don't need marginfi) |
| `Failed to load Kamino market` | Wrong `KAMINO_MARKET_ADDRESS` or RPC issue | Verify the market address exists on your target cluster |
| `Kora: signAndSendTransaction failed` | Kora node unreachable or misconfigured | Check `KORA_ENDPOINT`, ensure Kora node is running |
| `Transaction simulation failed` | Insufficient balance, wrong mint, or program not allowed | Check wallet balances with `npm run show-state`, verify `kora.toml` |
| Dashboard shows "Disconnected" | API server not running or wrong port | Ensure `npm run dev` is running, check `PORT` |
| `Payment rejected: insufficient liquidity` | Liquid balance minus reserves is below payment amount | Reduce payment size, lower `minLiquidReserveUsdc`, or wait for a withdrawal from lending |
