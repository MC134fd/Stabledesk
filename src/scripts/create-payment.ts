import { loadEnv } from "../config/env.js";
import { createSolanaClient } from "../integrations/solana.js";
import { createKoraClient } from "../integrations/kora.js";
import { createPaymentService } from "../payments/payment-service.js";

export async function createPayment() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: create-payment <recipient> <amountUsdc> [reference]");
    console.error("  amountUsdc is in human-readable form (e.g. 100 = 100 USDC)");
    process.exit(1);
  }

  const [recipient, amountStr, ...refWords] = args;
  const amountUsdc = parseFloat(amountStr);
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    console.error("amountUsdc must be a positive number");
    process.exit(1);
  }
  const reference = refWords.join(" ") || undefined;

  const env = loadEnv();
  const solana = createSolanaClient(env.SOLANA_RPC_URL, env.TREASURY_KEYPAIR);
  const kora = createKoraClient(solana, env.KORA_ENDPOINT ? { endpoint: env.KORA_ENDPOINT } : undefined);

  const paymentService = createPaymentService({ kora });

  const record = paymentService.createPayment({ recipient, amountUsdc, reference });
  console.log(`\nPayment created: ${record.id}`);
  console.log(`  To: ${recipient}`);
  console.log(`  Amount: ${amountUsdc.toFixed(2)} USDC`);
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
