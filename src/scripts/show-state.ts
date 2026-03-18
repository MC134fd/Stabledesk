import { loadEnv } from "../config/env.js";
import { createSolanaClient } from "../integrations/solana.js";
import { createUsdcClient } from "../integrations/usdc.js";
import { createKaminoClient } from "../integrations/kamino.js";
import { fmtUsdc } from "../core/liquidity-policy.js";

export async function showState() {
  const env = loadEnv();
  const solana = createSolanaClient(env.SOLANA_RPC_URL, env.TREASURY_KEYPAIR);
  const usdc = createUsdcClient(solana, env.USDC_MINT_ADDRESS);
  const kamino = createKaminoClient(solana, env.KAMINO_MARKET_ADDRESS, env.KAMINO_PROGRAM_ID || undefined);

  const [balance, position, slot] = await Promise.all([
    usdc.getBalance(),
    kamino.getPosition(),
    solana.getSlot(),
  ]);

  const total = balance + position.depositedUsdc;

  console.log("\n=== StableDesk Treasury State ===");
  console.log(`  Wallet:           ${solana.keypair.publicKey.toBase58()}`);
  console.log(`  Liquid USDC:      ${fmtUsdc(balance)}`);
  console.log(`  Kamino Deposited: ${fmtUsdc(position.depositedUsdc)}`);
  console.log(`  Total AUM:        ${fmtUsdc(total)}`);
  console.log(`  Slot:             ${slot}`);
  console.log(`  Timestamp:        ${new Date().toISOString()}`);
  console.log("=================================\n");
}

showState().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
