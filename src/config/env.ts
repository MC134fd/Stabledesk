import "dotenv/config";

export interface Env {
  SOLANA_RPC_URL: string;
  TREASURY_KEYPAIR: string;
  USDC_MINT_ADDRESS: string;
  KAMINO_PROGRAM_ID: string;
  KAMINO_MARKET_ADDRESS: string;
  KORA_ENDPOINT: string;
  KORA_API_KEY: string;
  KORA_FEE_TOKEN: string;
  SCHEDULER_INTERVAL_SECONDS: number;
  LOG_LEVEL: string;
  PORT: number;
  /** API key for write operations (POST /payments). Empty = no auth required. */
  API_KEY: string;
}

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function intOr(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n)) throw new Error(`Env var ${key} must be an integer, got "${raw}"`);
  return n;
}

export function loadEnv(): Env {
  return {
    SOLANA_RPC_URL: required("SOLANA_RPC_URL"),
    TREASURY_KEYPAIR: required("TREASURY_KEYPAIR"),
    USDC_MINT_ADDRESS: required("USDC_MINT_ADDRESS"),
    KAMINO_PROGRAM_ID: optional("KAMINO_PROGRAM_ID", ""),
    KAMINO_MARKET_ADDRESS: optional("KAMINO_MARKET_ADDRESS", ""),
    KORA_ENDPOINT: optional("KORA_ENDPOINT", ""),
    KORA_API_KEY: optional("KORA_API_KEY", ""),
    KORA_FEE_TOKEN: optional("KORA_FEE_TOKEN", ""),
    SCHEDULER_INTERVAL_SECONDS: intOr("SCHEDULER_INTERVAL_SECONDS", 60),
    LOG_LEVEL: optional("LOG_LEVEL", "info"),
    PORT: intOr("PORT", 3000),
    API_KEY: optional("API_KEY", ""),
  };
}
