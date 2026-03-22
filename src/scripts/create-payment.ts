import { loadEnv } from "../config/env.js";
import { createSolanaClient } from "../integrations/solana.js";
import { createKoraClient } from "../integrations/kora.js";
import { createPaymentService } from "../payments/payment-service.js";

export async function createPayment() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: create-payment <recipient> <amount> [currency] [reference]");
    console.error("  amount is in human-readable form (e.g. 100 = 100 tokens)");
    console.error("  currency defaults to USDC");
    process.exit(1);
  }

  const [recipient, amountStr, ...rest] = args;
  const amount = parseFloat(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("amount must be a positive number");
    process.exit(1);
  }

  // If third arg looks like a token symbol (all uppercase, <= 6 chars), treat as currency
  let currency = 'USDC';
  let reference: string | undefined;
  if (rest.length > 0 && /^[A-Z0-9]{2,6}$/.test(rest[0])) {
    currency = rest[0];
    reference = rest.slice(1).join(" ") || undefined;
  } else {
    reference = rest.join(" ") || undefined;
  }

  const env = loadEnv();
  const solana = createSolanaClient(env.SOLANA_RPC_URL, env.TREASURY_KEYPAIR);
  const kora = createKoraClient(solana, env.KORA_ENDPOINT ? { endpoint: env.KORA_ENDPOINT } : undefined);

  const paymentService = createPaymentService({ solana, kora });

  const record = paymentService.createPayment({ recipient, amount, currency, reference });
  console.log(`\nPayment created: ${record.id}`);
  console.log(`  To: ${recipient}`);
  console.log(`  Amount: ${amount.toFixed(2)} ${currency}`);
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
