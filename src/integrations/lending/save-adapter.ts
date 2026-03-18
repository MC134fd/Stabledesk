import { Transaction, PublicKey } from "@solana/web3.js";
import type { SolanaClient } from "../solana.js";
import type { LendingAdapter, LendingPosition, ProtocolId } from "./types.js";
import { getEnabledStablecoins, getStablecoin, rawToHuman } from "../../config/stablecoins.js";
import { createLogger } from "../../audit/logger.js";

const log = createLogger("save");

/**
 * Save Protocol (formerly Solend) lending adapter.
 *
 * Uses @solendprotocol/solend-sdk for deposit/withdraw.
 * Save uses a "reserve" model similar to Aave — each pool has reserves per token.
 * Users deposit and receive cTokens representing their share.
 *
 * SDK dynamically imported to avoid hard-failing if not installed.
 */

let SolendAction: any = null;
let SolendMarket: any = null;
let sdkLoaded = false;

async function loadSdk() {
  if (sdkLoaded) return;
  try {
    // @ts-ignore — optional dependency, may not be installed
    const mod = await import("@solendprotocol/solend-sdk");
    SolendAction = mod.SolendAction ?? mod.default?.SolendAction;
    SolendMarket = mod.SolendMarket ?? mod.default?.SolendMarket;
    sdkLoaded = true;
    log.info("Save (Solend) SDK loaded");
  } catch {
    log.warn("Save (Solend) SDK not installed — adapter will be unavailable");
  }
}

/** Main pool address */
const MAIN_POOL = "7XawhbbxtsRcQA8KTkHT9f9nc6d69UwqCDh6U5EEbEmX";

export function createSaveAdapter(
  solana: SolanaClient,
  poolAddress = MAIN_POOL,
): LendingAdapter {
  let market: any = null;

  async function ensureMarket() {
    if (market) return market;
    await loadSdk();
    if (!SolendMarket) throw new Error("Save SDK not installed. Run: npm install @solendprotocol/solend-sdk");

    market = await SolendMarket.initialize(solana.connection, "production", new PublicKey(poolAddress));
    await market.loadReserves();
    await market.loadRewards();
    log.info("Save market loaded", { pool: poolAddress });
    return market;
  }

  function findReserve(tokenSymbol: string): any {
    if (!market) return null;
    const reserves = market.reserves ?? [];
    // Match by symbol or by mint address
    const stable = getStablecoin(tokenSymbol);
    return reserves.find((r: any) => {
      const rSymbol = r.config?.symbol ?? r.config?.asset ?? "";
      const rMint = r.config?.liquidityToken?.mint ?? r.config?.mintAddress ?? "";
      return rSymbol.toUpperCase() === tokenSymbol.toUpperCase() ||
        (stable && rMint === stable.mint);
    });
  }

  return {
    id: "save" as ProtocolId,
    name: "Save (Solend)",

    async initialize() {
      await ensureMarket();
    },

    async getPositions(): Promise<LendingPosition[]> {
      await ensureMarket();
      const positions: LendingPosition[] = [];
      const stables = getEnabledStablecoins();

      // Fetch obligation once — it covers all tokens for this wallet
      let obligation: any = null;
      try {
        obligation = await market.fetchObligationByWallet(
          solana.keypair.publicKey.toBase58(),
        );
      } catch {
        // No obligation exists for this wallet
      }
      if (!obligation) return positions;

      for (const stable of stables) {
        const reserve = findReserve(stable.symbol);
        if (!reserve) continue;

        try {
          const deposit = obligation.deposits?.find(
            (d: any) => d.depositReserve?.toBase58?.() === reserve.config?.address ||
              d.mintAddress === stable.mint,
          );
          if (!deposit) continue;

          const amount = BigInt(Math.floor(
            (deposit.depositedAmount ?? 0) * (10 ** stable.decimals),
          ));
          if (amount <= 0n) continue;

          const apy = reserve.stats?.supplyInterestAPY ?? 0;

          positions.push({
            protocol: "save",
            token: stable.symbol,
            mint: stable.mint,
            depositedAmount: amount,
            supplyApy: apy,
          });
        } catch {
          // No deposit for this token
        }
      }

      return positions;
    },

    async getSupplyApy(tokenSymbol: string): Promise<number | undefined> {
      await ensureMarket();
      const reserve = findReserve(tokenSymbol);
      if (!reserve) return undefined;
      return reserve.stats?.supplyInterestAPY ?? 0;
    },

    async buildDepositTx(tokenSymbol: string, amount: bigint): Promise<Transaction> {
      await loadSdk();
      if (!SolendAction) throw new Error("Save SDK not installed");

      const stable = getStablecoin(tokenSymbol);
      if (!stable) throw new Error(`Save: ${tokenSymbol} not supported`);

      const action = await SolendAction.buildDepositTxns(
        solana.connection,
        rawToHuman(amount, stable.decimals),
        tokenSymbol,
        solana.keypair.publicKey,
        "production",
        new PublicKey(poolAddress),
      );

      const txns = await action.getTransactions();
      const tx = new Transaction();
      for (const t of txns) {
        if (t.instructions) {
          for (const ix of t.instructions) tx.add(ix);
        }
      }

      log.info("Save deposit tx built", { token: tokenSymbol, amount: amount.toString() });
      return tx;
    },

    async buildWithdrawTx(tokenSymbol: string, amount: bigint): Promise<Transaction> {
      await loadSdk();
      if (!SolendAction) throw new Error("Save SDK not installed");

      const stable = getStablecoin(tokenSymbol);
      if (!stable) throw new Error(`Save: ${tokenSymbol} not supported`);

      const action = await SolendAction.buildWithdrawTxns(
        solana.connection,
        rawToHuman(amount, stable.decimals),
        tokenSymbol,
        solana.keypair.publicKey,
        "production",
        new PublicKey(poolAddress),
      );

      const txns = await action.getTransactions();
      const tx = new Transaction();
      for (const t of txns) {
        if (t.instructions) {
          for (const ix of t.instructions) tx.add(ix);
        }
      }

      log.info("Save withdraw tx built", { token: tokenSymbol, amount: amount.toString() });
      return tx;
    },

    supportedTokens(): string[] {
      return ["USDC", "USDT"];
    },
  };
}
