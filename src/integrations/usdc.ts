import { Connection, PublicKey } from '@solana/web3.js';
import type { SolanaClient } from './solana.js';

// Standard Solana program addresses for ATA derivation (no @solana/spl-token needed)
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bXh');

export type UsdcBalance = {
  treasuryWallet: string;
  tokenAccount: string | null;
  accountExists: boolean;
  rawAmount: bigint;
  uiAmount: number;
};

function deriveAta(wallet: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}

export type UsdcTokenClient = {
  getBalance(): Promise<UsdcBalance>;
};

export type TokenClient = {
  /** Returns human-readable balances (e.g. USDC amount in dollars) keyed by token symbol */
  getBalances(): Promise<Map<string, number>>;
};

export function createUsdcClient(solana: SolanaClient, mint: string): UsdcTokenClient {
  return {
    async getBalance(): Promise<UsdcBalance> {
      return usdcClient.getBalance(
        solana.connection,
        solana.keypair.publicKey.toBase58(),
        mint,
      );
    },
  };
}

export function createTokenClient(_solana: SolanaClient): TokenClient {
  return {
    async getBalances(): Promise<Map<string, number>> {
      // Multi-token balance fetching — future milestone
      return new Map();
    },
  };
}

export const usdcClient = {
  async getBalance(
    connection: Connection,
    treasuryWallet: string,
    usdcMint: string,
  ): Promise<UsdcBalance> {
    let walletKey: PublicKey;
    let mintKey: PublicKey;

    try {
      walletKey = new PublicKey(treasuryWallet);
    } catch {
      throw new Error(`Invalid treasury wallet public key: "${treasuryWallet}"`);
    }

    try {
      mintKey = new PublicKey(usdcMint);
    } catch {
      throw new Error(`Invalid USDC mint public key: "${usdcMint}"`);
    }

    const ata = deriveAta(walletKey, mintKey);
    const tokenAccount = ata.toBase58();

    try {
      const { value } = await connection.getTokenAccountBalance(ata);
      return {
        treasuryWallet,
        tokenAccount,
        accountExists: true,
        rawAmount: BigInt(value.amount),
        uiAmount: value.uiAmount ?? 0,
      };
    } catch {
      // Token account does not exist — return a safe zero shape
      return {
        treasuryWallet,
        tokenAccount,
        accountExists: false,
        rawAmount: 0n,
        uiAmount: 0,
      };
    }
  },
};
