import { serve } from "@hono/node-server";
import { loadEnv } from "./config/env.js";
import { defaultPolicy } from "./config/policy.js";
import { createSolanaClient } from "./integrations/solana.js";
import { createUsdcClient } from "./integrations/usdc.js";
import { createKaminoClient } from "./integrations/kamino.js";
import { createKoraClient, type KoraConfig } from "./integrations/kora.js";
import { createScheduler } from "./core/scheduler.js";
import { createPaymentService } from "./payments/payment-service.js";
import { createApi } from "./api.js";
import { createLogger } from "./audit/logger.js";

const log = createLogger("app");

export async function start() {
  const env = loadEnv();

  // 1. Solana connection + keypair
  const solana = createSolanaClient(env.SOLANA_RPC_URL, env.TREASURY_KEYPAIR);

  // 2. USDC token client
  const usdc = createUsdcClient(solana, env.USDC_MINT_ADDRESS);

  // 3. Kamino lending client
  const kamino = createKaminoClient(
    solana,
    env.KAMINO_MARKET_ADDRESS,
    env.KAMINO_PROGRAM_ID || undefined,
  );

  // 4. Kora gas abstraction
  const koraConfig: KoraConfig | undefined = env.KORA_ENDPOINT
    ? {
        endpoint: env.KORA_ENDPOINT,
        apiKey: env.KORA_API_KEY || undefined,
        feeTokenMint: env.KORA_FEE_TOKEN || undefined,
      }
    : undefined;
  const kora = createKoraClient(solana, koraConfig);

  // 5. Payment service
  let scheduler: ReturnType<typeof createScheduler>;
  const paymentService = createPaymentService({
    usdc,
    kora,
    getState: () => scheduler.getState(),
    policy: defaultPolicy,
  });

  // 6. Scheduler (refresh → evaluate → rebalance → process)
  scheduler = createScheduler({
    solana,
    usdc,
    kamino,
    kora,
    policy: defaultPolicy,
    paymentService,
    intervalSeconds: env.SCHEDULER_INTERVAL_SECONDS,
  });

  // 7. REST API
  const api = createApi({
    getState: () => scheduler.getState(),
    getLastDecision: () => scheduler.getLastDecision(),
    paymentService,
  });

  // Start scheduler
  scheduler.start();

  // Start HTTP server
  const server = serve({ fetch: api.fetch, port: env.PORT }, (info) => {
    log.info(`StableDesk API running on http://localhost:${info.port}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    log.info("Shutting down...");
    scheduler.stop();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return { scheduler, api, server };
}

// Auto-start when run directly
start().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
