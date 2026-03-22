import { PublicKey, Transaction } from "@solana/web3.js";
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
  /** Cached Kora fee-payer public key */
  let payerKey: PublicKey | null = null;

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

  /** Fetch and cache the Kora fee-payer public key */
  async function getPayerKey(): Promise<PublicKey> {
    if (payerKey) return payerKey;
    if (!rpcClient) throw new Error("Kora not configured");

    const result = await rpcClient.getPayerSigner();
    const payerStr = (result as any)?.payer ?? (result as any)?.signer ?? String(result);
    payerKey = new PublicKey(payerStr);
    log.info("Kora payer key fetched", { payer: payerKey.toBase58() });
    return payerKey;
  }

  return {
    enabled,

    async sendTransaction(tx: Transaction): Promise<string> {
      if (!enabled || !rpcClient) {
        // Fallback: direct send (treasury pays gas in SOL)
        return solana.sendAndConfirm(tx);
      }

      // Kora flow:
      // 1. Fetch fee-payer key from Kora (cached after first call)
      // 2. Set Kora's key as fee-payer so the treasury never needs SOL
      // 3. Partially sign with treasury key
      // 4. Send to Kora for co-signing and submission
      const { blockhash, lastValidBlockHeight } =
        await solana.connection.getLatestBlockhash("confirmed");

      // Set fee payer to Kora's signer, not the treasury wallet
      try {
        const payer = await getPayerKey();
        tx.feePayer = payer;
      } catch (e) {
        // If we can't fetch the payer key, fall back to treasury as fee payer
        // Kora server may still rewrite it during co-signing
        log.warn("Could not fetch Kora payer key, using treasury as feePayer", {
          error: String(e),
        });
        tx.feePayer = solana.keypair.publicKey;
      }

      tx.recentBlockhash = blockhash;
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
