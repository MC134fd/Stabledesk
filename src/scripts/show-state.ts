import { loadEnv } from "../config/env.js";
import { createSolanaClient } from "../integrations/solana.js";
import { createTokenClient } from "../integrations/usdc.js";
import {
  createKaminoAdapter,
  createMarginfiAdapter,
  createSaveAdapter,
  createJupLendAdapter,
  createLendingManager,
} from "../integrations/lending/index.js";
import { fmtUsdc } from "../core/liquidity-policy.js";
import { formatTokenAmount } from "../config/stablecoins.js";

export async function showState() {
  const env = loadEnv();
  const solana = createSolanaClient(env.SOLANA_RPC_URL, env.TREASURY_KEYPAIR);
  const tokenClient = createTokenClient(solana);

  // Initialize all available lending adapters
  const adapters = [];
  if (env.KAMINO_MARKET_ADDRESS) {
    adapters.push(createKaminoAdapter(solana, env.KAMINO_MARKET_ADDRESS, env.KAMINO_PROGRAM_ID || undefined));
  }
  adapters.push(createMarginfiAdapter(solana));
  adapters.push(createSaveAdapter(solana));
  adapters.push(createJupLendAdapter(solana));

  const lendingManager = createLendingManager(adapters);
  await lendingManager.initializeAll();

  const [balances, portfolio, slot] = await Promise.all([
    tokenClient.getAllBalances(),
    lendingManager.getPortfolio(),
    solana.getSlot(),
  ]);

  let totalLiquid = 0n;
  let totalDeployed = portfolio.totalValueUsdc;
  for (const [, bal] of balances) totalLiquid += bal.amount;

  console.log("\n=== StableDesk Treasury State ===");
  console.log(`  Wallet: ${solana.keypair.publicKey.toBase58()}`);
  console.log(`  Slot:   ${slot}`);
  console.log(`  Time:   ${new Date().toISOString()}`);

  console.log("\n── Liquid Balances ──");
  for (const [symbol, bal] of balances) {
    if (bal.amount > 0n) {
      console.log(`  ${symbol.padEnd(6)} ${formatTokenAmount(bal.amount, 6)}`);
    }
  }
  if (totalLiquid === 0n) console.log("  (none)");

  console.log("\n── Lending Positions ──");
  if (portfolio.positions.length === 0) {
    console.log("  (none)");
  } else {
    for (const pos of portfolio.positions) {
      console.log(
        `  ${pos.protocol.padEnd(10)} ${pos.token.padEnd(6)} ${formatTokenAmount(pos.depositedAmount, 6).padStart(18)}  APY: ${(pos.supplyApy * 100).toFixed(2)}%`,
      );
    }
  }

  console.log("\n── Totals ──");
  console.log(`  Liquid:   ${fmtUsdc(totalLiquid)}`);
  console.log(`  Deployed: ${fmtUsdc(totalDeployed)}`);
  console.log(`  AUM:      ${fmtUsdc(totalLiquid + totalDeployed)}`);
  console.log("=================================\n");
}

showState().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
