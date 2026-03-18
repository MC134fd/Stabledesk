import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import type { SolanaClient } from "./solana.js";
import { getEnabledStablecoins, type StablecoinConfig } from "../config/stablecoins.js";
import { createLogger } from "../audit/logger.js";

const log = createLogger("token");

export interface TokenClient {
  /** Get balance for a single token by mint address */
  getBalance(mintAddress: string): Promise<bigint>;

  /** Get balances for all enabled stablecoins */
  getAllBalances(): Promise<Map<string, { symbol: string; mint: string; amount: bigint }>>;

  /** Build a transfer transaction for any SPL token */
  buildTransferTx(mintAddress: string, recipient: string, amount: bigint): Promise<Transaction>;
}

export function createTokenClient(solana: SolanaClient): TokenClient {
  const owner = solana.keypair.publicKey;

  async function getBalanceForMint(mint: PublicKey): Promise<bigint> {
    try {
      const ata = await getAssociatedTokenAddress(mint, owner);
      const account = await getAccount(solana.connection, ata);
      return account.amount;
    } catch (e: any) {
      if (e.name === "TokenAccountNotFoundError") return 0n;
      throw e;
    }
  }

  return {
    async getBalance(mintAddress: string): Promise<bigint> {
      return getBalanceForMint(new PublicKey(mintAddress));
    },

    async getAllBalances() {
      const stables = getEnabledStablecoins();
      const results = new Map<string, { symbol: string; mint: string; amount: bigint }>();

      // Fetch all balances in parallel
      const fetches = stables.map(async (stable) => {
        try {
          const amount = await getBalanceForMint(new PublicKey(stable.mint));
          return { stable, amount };
        } catch {
          return { stable, amount: 0n };
        }
      });

      const settled = await Promise.all(fetches);
      for (const { stable, amount } of settled) {
        results.set(stable.symbol, {
          symbol: stable.symbol,
          mint: stable.mint,
          amount,
        });
      }

      log.debug("Token balances fetched", {
        tokens: settled
          .filter((s) => s.amount > 0n)
          .map((s) => `${s.stable.symbol}=${s.amount.toString()}`)
          .join(", "),
      });

      return results;
    },

    async buildTransferTx(mintAddress: string, recipient: string, amount: bigint): Promise<Transaction> {
      const mint = new PublicKey(mintAddress);
      const recipientPubkey = new PublicKey(recipient);
      const senderAta = await getAssociatedTokenAddress(mint, owner);
      const recipientAta = await getAssociatedTokenAddress(mint, recipientPubkey);

      const tx = new Transaction();

      // Create recipient ATA if it doesn't exist
      try {
        await getAccount(solana.connection, recipientAta);
      } catch {
        log.info("Creating recipient ATA", { recipient, mint: mintAddress });
        tx.add(
          createAssociatedTokenAccountInstruction(owner, recipientAta, recipientPubkey, mint),
        );
      }

      tx.add(createTransferInstruction(senderAta, recipientAta, owner, amount));
      return tx;
    },
  };
}

/**
 * Legacy wrapper: creates a TokenClient that looks like the old UsdcClient.
 * Used by payment service for backward compatibility.
 */
export interface UsdcClient {
  mint: PublicKey;
  getBalance(): Promise<bigint>;
  buildTransferTx(recipient: string, amountMicroUsdc: bigint): Promise<Transaction>;
}

export function createUsdcClient(solana: SolanaClient, mintAddress: string): UsdcClient {
  const tokenClient = createTokenClient(solana);
  return {
    mint: new PublicKey(mintAddress),
    getBalance: () => tokenClient.getBalance(mintAddress),
    buildTransferTx: (recipient, amount) =>
      tokenClient.buildTransferTx(mintAddress, recipient, amount),
  };
}
