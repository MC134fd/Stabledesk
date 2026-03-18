/**
 * Registry of supported stablecoins on Solana.
 *
 * All amounts are stored in the token's native smallest unit.
 * For 6-decimal tokens: 1 USDC = 1_000_000 micro-units.
 */

export interface StablecoinConfig {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  /** "spl-token" (Token Program) or "token-2022" (Token Extensions) */
  tokenProgram: "spl-token" | "token-2022";
  /** Whether this token is enabled for treasury operations */
  enabled: boolean;
}

/**
 * Mainnet stablecoin mints.
 * Addresses sourced from official token lists and on-chain registries.
 * Tokens not yet live on Solana are marked enabled: false.
 */
export const STABLECOINS: Record<string, StablecoinConfig> = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    tokenProgram: "spl-token",
    enabled: true,
  },
  USDT: {
    symbol: "USDT",
    name: "Tether USD",
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    decimals: 6,
    tokenProgram: "spl-token",
    enabled: true,
  },
  USDS: {
    symbol: "USDS",
    name: "USDS (Sky Dollar)",
    mint: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA",
    decimals: 6,
    tokenProgram: "spl-token",
    enabled: true,
  },
  PYUSD: {
    symbol: "PYUSD",
    name: "PayPal USD",
    mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
    decimals: 6,
    tokenProgram: "token-2022",
    enabled: true,
  },
  USDG: {
    symbol: "USDG",
    name: "Global Dollar (Paxos)",
    mint: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
    decimals: 6,
    tokenProgram: "token-2022",
    enabled: true,
  },
  USD1: {
    symbol: "USD1",
    name: "USD1 (World Liberty Financial)",
    mint: "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB",
    decimals: 6,
    tokenProgram: "spl-token",
    enabled: true,
  },
  // CASH (Cashio) — exploited March 2022, token is effectively dead. Do not enable.
  CASH: {
    symbol: "CASH",
    name: "CASH (Cashio — defunct)",
    mint: "CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH",
    decimals: 6,
    tokenProgram: "spl-token",
    enabled: false,
  },
};

/** Devnet mints for testing (USDC only has a known devnet mint) */
export const DEVNET_OVERRIDES: Partial<Record<string, string>> = {
  USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

export function getEnabledStablecoins(): StablecoinConfig[] {
  return Object.values(STABLECOINS).filter((s) => s.enabled && s.mint);
}

export function getStablecoin(symbol: string): StablecoinConfig | undefined {
  return STABLECOINS[symbol.toUpperCase()];
}

export function mintToSymbol(mint: string): string | undefined {
  return Object.values(STABLECOINS).find((s) => s.mint === mint)?.symbol;
}

/** Look up a stablecoin config by its mint address */
export function getStablecoinByMint(mint: string): StablecoinConfig | undefined {
  return Object.values(STABLECOINS).find((s) => s.mint === mint);
}

/** Convert raw amount to human-readable with proper decimals */
export function formatTokenAmount(raw: bigint, decimals: number): string {
  if (raw < 0n) return "-" + formatTokenAmount(-raw, decimals);
  const factor = 10n ** BigInt(decimals);
  const whole = raw / factor;
  const frac = raw % factor;
  return `${whole.toString()}.${frac.toString().padStart(decimals, "0")}`;
}

/**
 * Convert raw token amount (bigint) to a human-readable number.
 * Uses string-based division to avoid Number() precision loss for amounts > 2^53.
 * Returns a number because most lending SDKs expect a JS number for amounts.
 */
export function rawToHuman(amount: bigint, decimals: number): number {
  const str = amount.toString();
  if (str.length <= decimals) {
    return parseFloat("0." + str.padStart(decimals, "0"));
  }
  const whole = str.slice(0, str.length - decimals);
  const frac = str.slice(str.length - decimals);
  return parseFloat(`${whole}.${frac}`);
}
