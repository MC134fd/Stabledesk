import { Transaction } from "@solana/web3.js";
// Use direct import path to avoid ESM resolution issues with the kit plugin
import { KoraClient as KoraRpcClient } from "@solana/kora/dist/src/client.js";
import type { SolanaClient } from "./solana.js";
import { createLogger } from "../audit/logger.js";

const log = createLogger("kora");

/**
 * Kora integration for gasless transaction execution.
 *
 * Uses the official @solana/kora SDK to submit transactions through
 * a Kora fee-payer relay. The treasury wallet never holds SOL —
 * Kora signs as fee-payer and optionally charges a USDC fee.
 *
 * If no Kora endpoint is configured, falls back to direct signing.
 */
export interface KoraClient {
  enabled: boolean;
  sendTransaction(tx: Transaction): Promise<string>;
  /** Fetch the Kora server's validation config (allowed programs, tokens, etc.) */
  getConfig(): Promise<unknown>;
}

export interface KoraConfig {
  endpoint: string;
  apiKey?: string;
  hmacSecret?: string;
  /** Fee token mint for USDC-denominated gas payment */
  feeTokenMint?: string;
}

export function createKoraClient(
  solana: SolanaClient,
  config?: KoraConfig,
): KoraClient {
  const enabled = !!config?.endpoint;
  let rpcClient: KoraRpcClient | null = null;

  if (enabled && config) {
    rpcClient = new KoraRpcClient({
      rpcUrl: config.endpoint,
      apiKey: config.apiKey,
      hmacSecret: config.hmacSecret,
    });
    log.info("Kora relay configured", { endpoint: config.endpoint });
  } else {
    log.warn("Kora endpoint not configured — using direct signing (requires SOL for gas)");
  }

  return {
    enabled,

    async sendTransaction(tx: Transaction): Promise<string> {
      if (!enabled || !rpcClient) {
        // Fallback: direct send (treasury pays gas in SOL)
        return solana.sendAndConfirm(tx);
      }

      // Kora flow:
      // 1. Set blockhash and partially sign with treasury key
      // 2. Serialize to base64 (without requiring all signatures)
      // 3. Send to Kora's signAndSendTransaction — Kora co-signs as fee payer
      const { blockhash, lastValidBlockHeight } =
        await solana.connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = solana.keypair.publicKey;

      tx.partialSign(solana.keypair);
      const serialized = tx.serialize({ requireAllSignatures: false });
      const encoded = Buffer.from(serialized).toString("base64");

      log.debug("Sending transaction to Kora relay");

      const response = await rpcClient.signAndSendTransaction({
        transaction: encoded,
      });

      const { signature } = response;
      log.info("Kora transaction submitted", { signature });

      // Confirm on-chain
      await solana.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      log.info("Kora transaction confirmed", { signature });
      return signature;
    },

    async getConfig() {
      if (!rpcClient) return null;
      return rpcClient.getConfig();
    },
  };
}
