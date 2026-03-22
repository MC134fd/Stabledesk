import 'dotenv/config';

type EnvConfig = {
  /** Legacy fields */
  rpcUrl: string;
  treasuryWallet: string;
  /** Solana connection */
  SOLANA_RPC_URL: string;
  /** Treasury keypair as base58-encoded secret key */
  TREASURY_KEYPAIR: string;
  /** USDC mint address (defaults to mainnet) */
  USDC_MINT_ADDRESS: string;
  /** Optional Kora relay endpoint */
  KORA_ENDPOINT: string | undefined;
  KORA_API_KEY: string | undefined;
  KORA_FEE_TOKEN: string | undefined;
  /** Kamino markets (comma-separated) */
  KAMINO_MARKET_ADDRESSES: string[];
  KAMINO_MARKET_LABELS: string[];
  /** Kamino program IDs (comma-separated, one per market; empty = default) */
  KAMINO_PROGRAM_IDS: (string | undefined)[];
  /** Scheduler tick interval in seconds (default: 60) */
  SCHEDULER_INTERVAL_SECONDS: number;
  /** Optional API key for write endpoints */
  API_KEY: string | undefined;
  /** HTTP port (default: 3000) */
  PORT: number;
};

function requireEnv(key: string): string {
  const value = (process.env[key] ?? '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string): string | undefined {
  const value = (process.env[key] ?? '').trim();
  return value || undefined;
}

export function loadEnv(): EnvConfig {
  const rpcUrl = requireEnv('SOLANA_RPC_URL');
  const treasuryWallet = requireEnv('TREASURY_WALLET_PUBLIC_KEY');

  return {
    rpcUrl,
    treasuryWallet,
    SOLANA_RPC_URL: rpcUrl,
    TREASURY_KEYPAIR: optionalEnv('TREASURY_KEYPAIR') ?? '',
    USDC_MINT_ADDRESS: optionalEnv('USDC_MINT_ADDRESS') ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    KORA_ENDPOINT: optionalEnv('KORA_ENDPOINT'),
    KORA_API_KEY: optionalEnv('KORA_API_KEY'),
    KORA_FEE_TOKEN: optionalEnv('KORA_FEE_TOKEN'),
    KAMINO_MARKET_ADDRESSES: (() => {
      const raw = optionalEnv('KAMINO_MARKET_ADDRESS') ?? '';
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    })(),
    KAMINO_MARKET_LABELS: (() => {
      const raw = optionalEnv('KAMINO_MARKET_LABELS') ?? '';
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    })(),
    KAMINO_PROGRAM_IDS: (() => {
      const raw = optionalEnv('KAMINO_PROGRAM_ID') ?? '';
      return raw.split(',').map(s => s.trim() || undefined);
    })(),
    SCHEDULER_INTERVAL_SECONDS: parseInt(process.env['SCHEDULER_INTERVAL_SECONDS'] ?? '60', 10),
    API_KEY: optionalEnv('API_KEY'),
    PORT: parseInt(process.env['PORT'] ?? '3000', 10),
  };
}
