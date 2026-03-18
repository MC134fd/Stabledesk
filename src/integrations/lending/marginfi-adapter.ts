import { Transaction, PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { SolanaClient } from "../solana.js";
import type { LendingAdapter, LendingPosition, ProtocolId } from "./types.js";
import { getEnabledStablecoins, getStablecoin } from "../../config/stablecoins.js";
import { createLogger } from "../../audit/logger.js";

const log = createLogger("marginfi");

/**
 * marginfi lending adapter.
 *
 * Uses @mrgnlabs/marginfi-client-v2 and @mrgnlabs/mrgn-common SDKs.
 *
 * marginfi uses a "bank" model — each supported token has a bank account.
 * Users create a "marginfi account" that holds their positions.
 *
 * Key SDK patterns (from docs.marginfi.com/ts-sdk):
 *   - MarginfiClient.fetch(config, wallet, connection)
 *   - client.getBankByTokenSymbol("USDC") / client.getBankByMint(mintPk)
 *   - marginfiAccount.deposit(amount, bank.address)
 *   - marginfiAccount.withdraw(amount, bank.address)
 *   - bank.computeInterestRates() → { lendingRate, borrowingRate }
 *   - balance.computeUsdValue(bank, oraclePrice) → { assets, liabilities }
 *
 * SDK dynamically imported to avoid hard-failing if not installed.
 */

// Lazy-loaded SDK references
let MarginfiClient: any = null;
let getConfig: any = null;
let NodeWallet: any = null;
let sdkLoaded = false;

async function loadSdk() {
  if (sdkLoaded) return;
  try {
    // @ts-ignore — optional dependency, may not be installed
    const clientMod = await import("@mrgnlabs/marginfi-client-v2");
    MarginfiClient = clientMod.MarginfiClient ?? clientMod.default?.MarginfiClient;
    getConfig = clientMod.getConfig ?? clientMod.default?.getConfig;

    // @ts-ignore — optional dependency
    const commonMod = await import("@mrgnlabs/mrgn-common");
    NodeWallet = commonMod.NodeWallet ?? commonMod.default?.NodeWallet;

    sdkLoaded = true;
    log.info("marginfi SDK loaded");
  } catch {
    log.warn("marginfi SDK not installed — adapter will be unavailable");
  }
}

/** marginfi program ID (mainnet v2) */
const MARGINFI_PROGRAM_ID = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA";

export function createMarginfiAdapter(solana: SolanaClient): LendingAdapter {
  let client: any = null;
  let account: any = null;

  async function ensureClient() {
    if (client) return client;
    await loadSdk();
    if (!MarginfiClient) throw new Error("marginfi SDK not installed. Run: npm install @mrgnlabs/marginfi-client-v2 @mrgnlabs/mrgn-common");

    // Create a proper NodeWallet from the keypair (per docs)
    const wallet = NodeWallet
      ? new NodeWallet(solana.keypair)
      : { publicKey: solana.keypair.publicKey, signTransaction: async (tx: any) => tx, signAllTransactions: async (txs: any) => txs };

    const config = getConfig?.("production") ?? { programId: new PublicKey(MARGINFI_PROGRAM_ID) };
    client = await MarginfiClient.fetch(config, wallet, solana.connection);
    log.info("marginfi client initialized");
    return client;
  }

  async function ensureAccount() {
    if (account) return account;
    const c = await ensureClient();
    const accounts = await c.getMarginfiAccountsForAuthority(solana.keypair.publicKey);
    account = accounts?.[0] ?? null;
    return account;
  }

  return {
    id: "marginfi" as ProtocolId,
    name: "marginfi",

    async initialize() {
      await ensureClient();
    },

    async getPositions(): Promise<LendingPosition[]> {
      const acct = await ensureAccount();
      if (!acct) return [];

      const positions: LendingPosition[] = [];
      const stables = getEnabledStablecoins();
      const c = await ensureClient();

      try {
        const balances = acct.activeBalances ?? acct.balances ?? [];
        for (const bal of balances) {
          if (!bal.active) continue;

          const bankAddress = bal.bankPk?.toBase58() ?? "";
          const bank = c.getBankByPk?.(bankAddress) ?? c.banks?.get(bankAddress);
          if (!bank) continue;

          const mintStr = bank.mint?.toBase58() ?? "";
          const stable = stables.find((s) => s.mint === mintStr);
          if (!stable) continue;

          // Use computeUsdValue with oracle price for accurate position data
          let depositAmount = 0;
          try {
            const oraclePrice = c.getOraclePriceByBank?.(bank.address);
            if (oraclePrice) {
              const { assets } = bal.computeUsdValue(bank, oraclePrice);
              depositAmount = assets ?? 0;
            } else {
              // Fallback: compute quantity directly
              depositAmount = bal.computeQuantityUi?.(bank)?.assets ?? 0;
            }
          } catch {
            depositAmount = bal.computeQuantityUi?.(bank)?.assets ?? 0;
          }

          const rawAmount = BigInt(Math.floor(depositAmount * (10 ** stable.decimals)));
          if (rawAmount <= 0n) continue;

          const apy = bank.computeInterestRates?.()?.lendingRate ?? 0;

          positions.push({
            protocol: "marginfi",
            token: stable.symbol,
            mint: stable.mint,
            depositedAmount: rawAmount,
            supplyApy: apy,
          });
        }
      } catch (e) {
        log.error("Failed to read marginfi positions", { error: String(e) });
      }

      return positions;
    },

    async getSupplyApy(tokenSymbol: string): Promise<number | undefined> {
      const c = await ensureClient();
      const stable = getStablecoin(tokenSymbol);
      if (!stable) return undefined;

      try {
        // Use getBankByTokenSymbol or getBankByMint per SDK docs
        let bank = c.getBankByTokenSymbol?.(tokenSymbol);
        if (!bank) {
          bank = c.getBankByMint?.(new PublicKey(stable.mint));
        }
        if (!bank) return undefined;
        return bank.computeInterestRates?.()?.lendingRate ?? 0;
      } catch {
        return undefined;
      }
    },

    async buildDepositTx(tokenSymbol: string, amount: bigint): Promise<Transaction> {
      const acct = await ensureAccount();
      const stable = getStablecoin(tokenSymbol);
      if (!stable) throw new Error(`marginfi: ${tokenSymbol} not supported`);

      const c = await ensureClient();
      // Use getBankByTokenSymbol per docs (preferred), fallback to getBankByMint
      let bank = c.getBankByTokenSymbol?.(tokenSymbol);
      if (!bank) {
        bank = c.getBankByMint?.(new PublicKey(stable.mint));
      }
      if (!bank) throw new Error(`marginfi: no bank found for ${tokenSymbol}`);

      const humanAmount = Number(amount) / (10 ** stable.decimals);

      // If no marginfi account exists, create one first
      if (!acct) {
        log.info("Creating marginfi account for first deposit");
        const createIxs = await c.makeCreateMarginfiAccountIx(solana.keypair.publicKey);
        const depositIxs = await c.makeDepositIx(
          bank.address, humanAmount, solana.keypair.publicKey,
        );
        const tx = new Transaction();
        for (const ix of [...(createIxs.instructions ?? [createIxs]), ...(depositIxs.instructions ?? [depositIxs])]) tx.add(ix);
        return tx;
      }

      // Use the account's deposit instruction builder (makeDepositIx)
      const depositIxs = await acct.makeDepositIx(humanAmount, bank.address);
      const tx = new Transaction();
      for (const ix of (depositIxs.instructions ?? [depositIxs])) tx.add(ix);

      log.info("marginfi deposit tx built", { token: tokenSymbol, amount: amount.toString() });
      return tx;
    },

    async buildWithdrawTx(tokenSymbol: string, amount: bigint): Promise<Transaction> {
      const acct = await ensureAccount();
      if (!acct) throw new Error("marginfi: no account found — nothing to withdraw");

      const stable = getStablecoin(tokenSymbol);
      if (!stable) throw new Error(`marginfi: ${tokenSymbol} not supported`);

      const c = await ensureClient();
      let bank = c.getBankByTokenSymbol?.(tokenSymbol);
      if (!bank) {
        bank = c.getBankByMint?.(new PublicKey(stable.mint));
      }
      if (!bank) throw new Error(`marginfi: no bank found for ${tokenSymbol}`);

      const humanAmount = Number(amount) / (10 ** stable.decimals);

      // Use the account's withdraw instruction builder (makeWithdrawIx)
      const withdrawIxs = await acct.makeWithdrawIx(humanAmount, bank.address);
      const tx = new Transaction();
      for (const ix of (withdrawIxs.instructions ?? [withdrawIxs])) tx.add(ix);

      log.info("marginfi withdraw tx built", { token: tokenSymbol, amount: amount.toString() });
      return tx;
    },

    supportedTokens(): string[] {
      return ["USDC", "USDT", "USDS", "PYUSD"];
    },
  };
}
