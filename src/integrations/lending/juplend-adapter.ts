import { Transaction, PublicKey } from "@solana/web3.js";
import type { SolanaClient } from "../solana.js";
import type { LendingAdapter, LendingPosition, ProtocolId } from "./types.js";
import { getEnabledStablecoins, getStablecoin } from "../../config/stablecoins.js";
import { createLogger } from "../../audit/logger.js";

const log = createLogger("juplend");

/**
 * Jupiter Lend (Earn) adapter.
 *
 * Uses the official Jupiter Lend SDKs:
 *   - @jup-ag/lend-read  — on-chain reads (positions, token details, APY)
 *   - @jup-ag/lend        — instruction builders (deposit, withdraw)
 *
 * Jupiter Lend wraps the JLP (Jupiter Liquidity Pool) vault. Users deposit
 * stablecoins and earn yield from perp trading fees + borrow interest.
 *
 * SDKs dynamically imported to avoid hard-failing if not installed.
 */

/** Jupiter Perpetuals program (handles JLP lending) */
const JUP_PERPS_PROGRAM = "PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu";

// Lazy-loaded SDK references
let ReadClient: any = null;
let getDepositIxs: any = null;
let getWithdrawIxs: any = null;
let sdkLoaded = false;
let readSdkLoaded = false;

async function loadReadSdk() {
  if (readSdkLoaded) return;
  try {
    // @ts-ignore — optional dependency
    const mod = await import("@jup-ag/lend-read");
    ReadClient = mod.Client ?? mod.default?.Client;
    readSdkLoaded = true;
    log.info("Jupiter Lend read SDK loaded");
  } catch {
    log.warn("@jup-ag/lend-read not installed — position/APY reads unavailable");
  }
}

async function loadLendSdk() {
  if (sdkLoaded) return;
  try {
    // @ts-ignore — optional dependency
    const mod = await import("@jup-ag/lend/earn");
    getDepositIxs = mod.getDepositIxs ?? mod.default?.getDepositIxs;
    getWithdrawIxs = mod.getWithdrawIxs ?? mod.default?.getWithdrawIxs;
    sdkLoaded = true;
    log.info("Jupiter Lend SDK loaded");
  } catch {
    log.warn("@jup-ag/lend not installed — deposit/withdraw unavailable");
  }
}

export function createJupLendAdapter(solana: SolanaClient): LendingAdapter {
  let readClient: any = null;

  async function ensureReadClient() {
    if (readClient) return readClient;
    await loadReadSdk();
    if (!ReadClient) throw new Error("@jup-ag/lend-read not installed. Run: npm install @jup-ag/lend-read");
    readClient = new ReadClient(solana.connection);
    return readClient;
  }

  return {
    id: "juplend" as ProtocolId,
    name: "Jupiter Lend",

    async initialize() {
      await Promise.allSettled([loadReadSdk(), loadLendSdk()]);
      if (ReadClient) {
        try {
          readClient = new ReadClient(solana.connection);
          log.info("Jupiter Lend initialized");
        } catch (e) {
          log.warn("Jupiter Lend read client failed to init", { error: String(e) });
        }
      }
    },

    async getPositions(): Promise<LendingPosition[]> {
      const positions: LendingPosition[] = [];

      try {
        const client = await ensureReadClient();
        const userPositions = await client.lending.getUserPositions(
          solana.keypair.publicKey,
        );

        const stables = getEnabledStablecoins();
        for (const pos of userPositions ?? []) {
          const mintStr = pos.mint?.toBase58?.() ?? pos.mint ?? "";
          const stable = stables.find((s) => s.mint === mintStr);
          if (!stable) continue;

          const amount = BigInt(Math.floor(
            (pos.depositedAmount ?? pos.amount ?? 0) * (10 ** stable.decimals),
          ));
          if (amount <= 0n) continue;

          positions.push({
            protocol: "juplend",
            token: stable.symbol,
            mint: stable.mint,
            depositedAmount: amount,
            supplyApy: pos.apy ?? 0,
          });
        }
      } catch (e) {
        log.debug("Failed to fetch Jupiter Lend positions", { error: String(e) });
      }

      return positions;
    },

    async getSupplyApy(tokenSymbol: string): Promise<number | undefined> {
      try {
        const client = await ensureReadClient();
        const stable = getStablecoin(tokenSymbol);
        if (!stable) return undefined;

        const details = await client.lending.getJlTokenDetails(
          new PublicKey(stable.mint),
        );
        if (!details) return undefined;

        // APY from token details (lending rate)
        return details.apy ?? details.supplyApy ?? details.currentLendingRate ?? 0;
      } catch {
        return undefined;
      }
    },

    async buildDepositTx(tokenSymbol: string, amount: bigint): Promise<Transaction> {
      await loadLendSdk();
      if (!getDepositIxs) throw new Error("@jup-ag/lend not installed. Run: npm install @jup-ag/lend");

      const stable = getStablecoin(tokenSymbol);
      if (!stable) throw new Error(`Jupiter Lend: ${tokenSymbol} not supported`);

      // BN import — the SDK expects BN for amounts
      // @ts-ignore — bn.js may lack type declarations
      const { default: BN } = await import("bn.js");

      const { ixs } = await getDepositIxs({
        connection: solana.connection,
        signer: solana.keypair.publicKey,
        asset: new PublicKey(stable.mint),
        amount: new BN(amount.toString()),
      });

      const tx = new Transaction();
      for (const ix of ixs) tx.add(ix);

      log.info("Jupiter Lend deposit tx built", { token: tokenSymbol, amount: amount.toString() });
      return tx;
    },

    async buildWithdrawTx(tokenSymbol: string, amount: bigint): Promise<Transaction> {
      await loadLendSdk();
      if (!getWithdrawIxs) throw new Error("@jup-ag/lend not installed. Run: npm install @jup-ag/lend");

      const stable = getStablecoin(tokenSymbol);
      if (!stable) throw new Error(`Jupiter Lend: ${tokenSymbol} not supported`);

      // @ts-ignore — bn.js may lack type declarations
      const { default: BN } = await import("bn.js");

      const { ixs } = await getWithdrawIxs({
        connection: solana.connection,
        signer: solana.keypair.publicKey,
        asset: new PublicKey(stable.mint),
        amount: new BN(amount.toString()),
      });

      const tx = new Transaction();
      for (const ix of ixs) tx.add(ix);

      log.info("Jupiter Lend withdraw tx built", { token: tokenSymbol, amount: amount.toString() });
      return tx;
    },

    supportedTokens(): string[] {
      return ["USDC", "USDT"];
    },
  };
}
