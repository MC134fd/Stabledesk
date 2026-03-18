import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { SolanaClient } from "./solana.js";
import {
  getEnabledStablecoins,
  type StablecoinConfig,
} from "../config/stablecoins.js";
import { createLogger } from "../audit/logger.js";

const log = createLogger("token");

/**
 * Resolve the on-chain program ID for a stablecoin's token program.
 * "spl-token"  → TOKEN_PROGRAM_ID  (TokenkegQfeZyiNw...)
 * "token-2022" → TOKEN_2022_PROGRAM_ID (TokenzQdBNbLqP5V...)
 */
function resolveTokenProgramId(
  tokenProgram: StablecoinConfig["tokenProgram"],
): PublicKey {
  return tokenProgram === "token-2022"
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
}

/**
 * Look up which token program a mint belongs to.
 * Falls back to SPL Token if the mint is not in the registry.
 */
function programIdForMint(mintAddress: string): PublicKey {
  const stables = getEnabledStablecoins();
  const match = stables.find((s) => s.mint === mintAddress);
  return match
    ? resolveTokenProgramId(match.tokenProgram)
    : TOKEN_PROGRAM_ID;
}

export interface TokenClient {
  /** Get balance for a single token by mint address */
  getBalance(mintAddress: string): Promise<bigint>;

  /** Get balances for all enabled stablecoins */
  getAllBalances(): Promise<
    Map<string, { symbol: string; mint: string; amount: bigint }>
  >;

  /** Build a transfer transaction for any SPL / Token-2022 token */
  buildTransferTx(
    mintAddress: string,
    recipient: string,
    amount: bigint,
  ): Promise<Transaction>;
}

export function createTokenClient(solana: SolanaClient): TokenClient {
  const owner = solana.keypair.publicKey;

  /**
   * Fetch the token balance for a single mint.
   * Correctly resolves the ATA and reads it with the right program ID.
   */
  async function getBalanceForMint(
    mint: PublicKey,
    programId: PublicKey,
  ): Promise<bigint> {
    try {
      const ata = await getAssociatedTokenAddress(
        mint,
        owner,
        false,            // allowOwnerOffCurve
        programId,        // ← token program
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const account = await getAccount(
        solana.connection,
        ata,
        "confirmed",
        programId,        // ← token program
      );
      return account.amount;
    } catch (e: any) {
      // Account doesn't exist yet → balance is 0
      if (
        e.name === "TokenAccountNotFoundError" ||
        e.name === "AccountNotFoundError"
      ) {
        return 0n;
      }
      throw e;
    }
  }

  return {
    async getBalance(mintAddress: string): Promise<bigint> {
      const programId = programIdForMint(mintAddress);
      return getBalanceForMint(new PublicKey(mintAddress), programId);
    },

    async getAllBalances() {
      const stables = getEnabledStablecoins();
      const results = new Map<
        string,
        { symbol: string; mint: string; amount: bigint }
      >();

      // Fetch all balances in parallel — each with its correct program ID
      const fetches = stables.map(async (stable) => {
        try {
          const programId = resolveTokenProgramId(stable.tokenProgram);
          const amount = await getBalanceForMint(
            new PublicKey(stable.mint),
            programId,
          );
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

    async buildTransferTx(
      mintAddress: string,
      recipient: string,
      amount: bigint,
    ): Promise<Transaction> {
      const mint = new PublicKey(mintAddress);
      const recipientPubkey = new PublicKey(recipient);
      const programId = programIdForMint(mintAddress);

      const senderAta = await getAssociatedTokenAddress(
        mint,
        owner,
        false,
        programId,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const recipientAta = await getAssociatedTokenAddress(
        mint,
        recipientPubkey,
        false,
        programId,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const tx = new Transaction();

      // Create recipient ATA if it doesn't exist
      try {
        await getAccount(solana.connection, recipientAta, "confirmed", programId);
      } catch {
        log.info("Creating recipient ATA", {
          recipient,
          mint: mintAddress,
          program: programId.toBase58(),
        });
        tx.add(
          createAssociatedTokenAccountInstruction(
            owner,           // payer
            recipientAta,    // ata
            recipientPubkey, // owner of the new ATA
            mint,            // token mint
            programId,       // ← token program
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        );
      }

      tx.add(
        createTransferInstruction(
          senderAta,       // source
          recipientAta,    // destination
          owner,           // authority
          amount,          // amount
          [],              // multiSigners
          programId,       // ← token program
        ),
      );

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
  buildTransferTx(
    recipient: string,
    amountMicroUsdc: bigint,
  ): Promise<Transaction>;
}

export function createUsdcClient(
  solana: SolanaClient,
  mintAddress: string,
): UsdcClient {
  const tokenClient = createTokenClient(solana);
  return {
    mint: new PublicKey(mintAddress),
    getBalance: () => tokenClient.getBalance(mintAddress),
    buildTransferTx: (recipient, amount) =>
      tokenClient.buildTransferTx(mintAddress, recipient, amount),
  };
}
