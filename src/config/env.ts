type EnvConfig = {
  rpcUrl: string;
  treasuryWallet: string;
};

function requireEnv(key: string): string {
  const value = (process.env[key] ?? '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadEnv(): EnvConfig {
  return {
    rpcUrl: requireEnv('SOLANA_RPC_URL'),
    treasuryWallet: requireEnv('TREASURY_WALLET_PUBLIC_KEY'),
  };
}
