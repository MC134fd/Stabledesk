import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
  SendOptions,
  type Commitment,
} from "@solana/web3.js";
import bs58 from "bs58";
import { createLogger } from "../audit/logger.js";

const log = createLogger("solana");

export interface SolanaClient {
  connection: Connection;
  keypair: Keypair;
  sendAndConfirm(
    tx: Transaction | VersionedTransaction,
    signers?: Keypair[],
    opts?: SendOptions,
  ): Promise<string>;
  getSlot(): Promise<number>;
}

export function createSolanaClient(rpcUrl: string, keypairSecret: string): SolanaClient {
  const connection = new Connection(rpcUrl, "confirmed" as Commitment);

  // Support base58-encoded private key or JSON array
  let keypair: Keypair;
  try {
    if (keypairSecret.startsWith("[")) {
      const bytes = new Uint8Array(JSON.parse(keypairSecret));
      keypair = Keypair.fromSecretKey(bytes);
    } else {
      keypair = Keypair.fromSecretKey(bs58.decode(keypairSecret));
    }
  } catch (e) {
    throw new Error(`Invalid TREASURY_KEYPAIR: ${(e as Error).message}`);
  }

  log.info("Solana client initialized", {
    rpc: rpcUrl,
    wallet: keypair.publicKey.toBase58(),
  });

  return {
    connection,
    keypair,

    async sendAndConfirm(tx, signers, opts) {
      if (tx instanceof Transaction) {
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = keypair.publicKey;
        tx.sign(keypair, ...(signers ?? []));

        const sig = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          ...opts,
        });

        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        log.info("Transaction confirmed", { signature: sig });
        return sig;
      }

      // VersionedTransaction path (used by Kora-relayed txns)
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        ...opts,
      });
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      log.info("Transaction confirmed (versioned)", { signature: sig });
      return sig;
    },

    async getSlot() {
      return connection.getSlot("confirmed");
    },
  };
}
