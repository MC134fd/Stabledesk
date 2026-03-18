import { loadEnv } from "../config/env.js";
import { defaultPolicy } from "../config/policy.js";
import { createSolanaClient } from "../integrations/solana.js";
import { createUsdcClient } from "../integrations/usdc.js";
import { createKoraClient } from "../integrations/kora.js";
import { createPaymentService } from "../payments/payment-service.js";
import { emptyState, type TreasuryState } from "../core/treasury-state.js";
import { fmtUsdc } from "../core/liquidity-policy.js";

export async function createPayment() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: create-payment <recipient> <amountUsdc> [memo]");
    console.error("  amountUsdc is in human-readable form (e.g. 100 = 100 USDC)");
    process.exit(1);
  }

  const [recipient, amountStr, ...memoWords] = args;
  const amountUsdc = BigInt(Math.floor(parseFloat(amountStr) * 1_000_000));
  const memo = memoWords.join(" ") || undefined;

  const env = loadEnv();
  const solana = createSolanaClient(env.SOLANA_RPC_URL, env.TREASURY_KEYPAIR);
  const usdc = createUsdcClient(solana, env.USDC_MINT_ADDRESS);
  const kora = createKoraClient(solana, env.KORA_ENDPOINT ? { endpoint: env.KORA_ENDPOINT } : undefined);

  // Fetch live state for liquidity check
  const balance = await usdc.getBalance();
  const state: TreasuryState = {
    ...emptyState(),
    liquidUsdc: balance,
    totalUsdc: balance,
  };

  const paymentService = createPaymentService({
    usdc,
    kora,
    getState: () => state,
    policy: defaultPolicy,
  });

  const record = paymentService.createPayment({ recipient, amountUsdc, memo });
  console.log(`\nPayment created: ${record.id}`);
  console.log(`  To: ${recipient}`);
  console.log(`  Amount: ${fmtUsdc(amountUsdc)}`);
  console.log(`  Status: ${record.status}`);

  // Process immediately
  console.log("\nProcessing...");
  const result = await paymentService.processPayment(record.id);
  console.log(`  Status: ${result.status}`);
  if (result.txSignature) console.log(`  Tx: ${result.txSignature}`);
  if (result.failureReason) console.log(`  Error: ${result.failureReason}`);
}

createPayment().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
