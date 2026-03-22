import { Connection, PublicKey } from '@solana/web3.js';
import type { SolanaClient } from './solana.js';
import { createLogger } from '../audit/logger.js';
import { getEnabledStablecoins } from '../config/stablecoins.js';

const log = createLogger('usdc');

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');


export type UsdcBalance = {
  treasuryWallet: string;
  tokenAccount: string | null;
  accountExists: boolean;
  rawAmount: bigint;
  uiAmount: number;
};

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

    // Fetch all token accounts for this mint owned by the wallet,
    // not just the derived ATA — USDC may be in a non-ATA account.
    try {
      log.debug('Fetching USDC balance', { wallet: treasuryWallet, mint: usdcMint });
      const { value: accounts } = await connection.getParsedTokenAccountsByOwner(walletKey, {
        mint: mintKey,
      });

      if (accounts.length === 0) {
        log.debug('No USDC token accounts found for wallet');
        return {
          treasuryWallet,
          tokenAccount: null,
          accountExists: false,
          rawAmount: 0n,
          uiAmount: 0,
        };
      }

      // Sum across all token accounts for this mint
      let totalRaw = 0n;
      let totalUi = 0;
      let firstAccount: string | null = null;

      for (const acct of accounts) {
        const info = acct.account.data.parsed.info;
        const raw = BigInt(info.tokenAmount.amount);
        const ui = info.tokenAmount.uiAmount ?? 0;
        totalRaw += raw;
        totalUi += ui;
        if (!firstAccount) firstAccount = acct.pubkey.toBase58();
      }

      log.debug('USDC balance fetched', {
        accounts: accounts.length,
        totalRaw: totalRaw.toString(),
        totalUi,
      });

      return {
        treasuryWallet,
        tokenAccount: firstAccount,
        accountExists: true,
        rawAmount: totalRaw,
        uiAmount: totalUi,
      };
    } catch (err) {
      log.warn('Failed to fetch USDC balance — returning 0', {
        wallet: treasuryWallet,
        mint: usdcMint,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        treasuryWallet,
        tokenAccount: null,
        accountExists: false,
        rawAmount: 0n,
        uiAmount: 0,
      };
    }
  },
};

export async function fetchAllStablecoinBalances(
  connection: Connection,
  walletAddress: string,
): Promise<Record<string, number>> {
  const walletKey = new PublicKey(walletAddress);
  const enabledCoins = getEnabledStablecoins();

  // Build result with all enabled coins defaulting to 0
  const balances: Record<string, number> = {};
  for (const coin of enabledCoins) {
    balances[coin.symbol] = 0;
  }

  // Build a mint→symbol lookup set for fast filtering
  const mintSet = new Map<string, string>();
  for (const coin of enabledCoins) {
    mintSet.set(coin.mint, coin.symbol);
  }

  try {
    // Query both token programs in parallel
    const [splResult, t22Result] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(walletKey, {
        programId: TOKEN_PROGRAM_ID,
      }),
      connection.getParsedTokenAccountsByOwner(walletKey, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

    const allAccounts = [...splResult.value, ...t22Result.value];

    for (const acct of allAccounts) {
      const info = acct.account.data.parsed.info;
      const mint: string = info.mint;
      const symbol = mintSet.get(mint);
      if (!symbol) continue; // Not a tracked stablecoin
      const ui: number = info.tokenAmount.uiAmount ?? 0;
      balances[symbol] += ui;
    }

    log.debug('All stablecoin balances fetched', { balances });
  } catch (err) {
    log.warn('Failed to fetch stablecoin balances — returning zeros', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return balances;
}
