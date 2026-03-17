# StableDesk

Autonomous institutional stablecoin treasury backend on Solana.

## Overview

<!-- TODO: describe the system's purpose, architecture, and key components -->

## Getting Started

```bash
npm install
cp .env.example .env
npm run dev
```

## Scripts

| Command          | Description                        |
| ---------------- | ---------------------------------- |
| `npm run dev`    | Run in watch mode via tsx          |
| `npm run build`  | Compile TypeScript to dist/        |
| `npm start`      | Run compiled output                |
| `npm test`       | Run Vitest test suite              |
| `npm run typecheck` | Type-check without emitting    |

## Project Structure

```
src/
  config/       # Environment and policy configuration
  core/         # Treasury state, liquidity policy, scheduler
  integrations/ # Solana, USDC, Kamino clients
  payments/     # Payment types, store, and service
  audit/        # Logger and audit service
  scripts/      # Runnable CLI entry points
tests/
  connectivity/ # Live RPC connectivity checks
  core/         # Unit tests for core logic
  payments/     # Payment workflow tests
  integrations/ # Integration-level tests
  audit/        # Audit and safety tests
  fixtures/     # Shared test data
```

## Environment

Copy `.env.example` to `.env` and fill in values before running.

<!-- TODO: document required environment variables -->
