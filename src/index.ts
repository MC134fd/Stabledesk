import { serve } from "@hono/node-server";
import { loadEnv } from "./config/env.js";
import { initializeDatabase } from "./db/database.js";
import { defaultPolicy } from "./config/policy.js";
import { createSolanaClient } from "./integrations/solana.js";
import { createUsdcClient, createTokenClient } from "./integrations/usdc.js";
import { createKoraClient, type KoraConfig } from "./integrations/kora.js";
import {
  createKaminoAdapter,
  createMarginfiAdapter,
  createSaveAdapter,
  createJupLendAdapter,
  createLendingManager,
  type LendingAdapter,
} from "./integrations/lending/index.js";
import { createScheduler } from "./core/scheduler.js";
import { emptyState } from "./core/treasury-state.js";
import { createPaymentService } from "./payments/payment-service.js";
import { createApi } from "./api.js";
import { createLogger } from "./audit/logger.js";

const log = createLogger("app");

export async function start() {
  const env = loadEnv();

  // 0. Initialize SQLite database (users + sessions schema)
  initializeDatabase();

  // 1. Solana connection + keypair
  const solana = createSolanaClient(env.SOLANA_RPC_URL, env.TREASURY_KEYPAIR);

  // 2. Multi-token client (fetches balances for all enabled stablecoins)
  const tokenClient = createTokenClient(solana);

  // 3. Legacy USDC client (used by payment service for transfers)
  const usdc = createUsdcClient(solana, env.USDC_MINT_ADDRESS);

  // 4. Kora gas abstraction
  const koraConfig: KoraConfig | undefined = env.KORA_ENDPOINT
    ? {
        endpoint: env.KORA_ENDPOINT,
        apiKey: env.KORA_API_KEY || undefined,
        feeTokenMint: env.KORA_FEE_TOKEN || undefined,
      }
    : undefined;
  const kora = createKoraClient(solana, koraConfig);

  // 5. Lending protocol adapters
  const adapters: LendingAdapter[] = [];

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

  // marginfi (available if SDK is installed)
  adapters.push(createMarginfiAdapter(solana));

  // Save / Solend (available if SDK is installed)
  adapters.push(createSaveAdapter(solana));

  // Jupiter Lend (available if SDK is installed)
  adapters.push(createJupLendAdapter(solana));

  const lendingManager = createLendingManager(adapters);

  // Initialize adapters (non-blocking — failures are logged, not fatal)
  lendingManager.initializeAll().catch((err) => {
    log.warn("Some lending adapters failed to initialize", { error: String(err) });
  });

  // 6. Scheduler (declared first so payment service can reference it safely)
  //    Use a lazy getter to avoid TDZ issues — getState returns emptyState
  //    until the scheduler's first tick completes.
  let scheduler: ReturnType<typeof createScheduler> | null = null;

  // 7. Payment service
  const paymentService = createPaymentService({
    usdc,
    kora,
    getState: () => scheduler?.getState() ?? emptyState(),
    policy: defaultPolicy,
  });

  // 8. Scheduler (refresh → evaluate → rebalance → process)
  scheduler = createScheduler({
    solana,
    tokenClient,
    lendingManager,
    kora,
    policy: defaultPolicy,
    paymentService,
    intervalSeconds: env.SCHEDULER_INTERVAL_SECONDS,
  });

  // 9. REST API
  const api = createApi({
    getState: () => scheduler!.getState(),
    getLastDecision: () => scheduler!.getLastDecision(),
    lendingManager,
    paymentService,
  });

  // Start scheduler
  scheduler.start();

  // Start HTTP server
  const server = serve({ fetch: api.fetch, port: env.PORT }, (info) => {
    log.info(`StableDesk API running on http://localhost:${info.port}`);
    log.info(`Lending adapters: ${adapters.map((a) => a.name).join(", ")}`);
    log.info(`Supported tokens: ${lendingManager.allSupportedTokens().join(", ")}`);
    if (env.API_KEY) {
      log.info("API key authentication enabled for write operations");
    } else {
      log.warn("No API_KEY set — write endpoints are unauthenticated");
    }
  });

  // Graceful shutdown — stop scheduler and wait for server to close
  const shutdown = () => {
    log.info("Shutting down...");
    scheduler!.stop();
    server.close(() => {
      log.info("Server closed");
      process.exit(0);
    });
    // Force exit after 10s if server doesn't close cleanly
    setTimeout(() => process.exit(0), 10_000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return { scheduler, api, server, lendingManager };
}

// Auto-start when run directly
start().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
