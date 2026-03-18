import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import type { SolanaClient } from "./solana.js";
import { createLogger } from "../audit/logger.js";

const log = createLogger("usdc");

export interface UsdcClient {
  mint: PublicKey;
  getBalance(): Promise<bigint>;
  buildTransferTx(recipient: string, amountMicroUsdc: bigint): Promise<Transaction>;
}

export function createUsdcClient(solana: SolanaClient, mintAddress: string): UsdcClient {
  const mint = new PublicKey(mintAddress);
  const owner = solana.keypair.publicKey;

  return {
    mint,

    async getBalance(): Promise<bigint> {
      try {
        const ata = await getAssociatedTokenAddress(mint, owner);
        const account = await getAccount(solana.connection, ata);
        log.debug("USDC balance fetched", { balance: account.amount.toString() });
        return account.amount;
      } catch (e: any) {
        if (e.name === "TokenAccountNotFoundError") {
          log.warn("Treasury USDC token account does not exist yet");
          return 0n;
        }
        throw e;
      }
    },

    async buildTransferTx(recipient: string, amountMicroUsdc: bigint): Promise<Transaction> {
      const recipientPubkey = new PublicKey(recipient);
      const senderAta = await getAssociatedTokenAddress(mint, owner);
      const recipientAta = await getAssociatedTokenAddress(mint, recipientPubkey);

      const tx = new Transaction();

      // Create recipient ATA if it doesn't exist
      try {
        await getAccount(solana.connection, recipientAta);
      } catch {
        log.info("Creating recipient ATA", { recipient });
        tx.add(
          createAssociatedTokenAccountInstruction(owner, recipientAta, recipientPubkey, mint),
        );
      }

      tx.add(
        createTransferInstruction(senderAta, recipientAta, owner, amountMicroUsdc),
      );

      return tx;
    },
  };
}
