import { describe, it } from 'vitest';

// TODO: These tests require a live RPC endpoint (devnet or mainnet).
// Set SOLANA_RPC_URL in .env before running.

describe('Solana RPC Connectivity', () => {
  it.todo('should connect to the configured RPC endpoint');
  it.todo('should return a valid latest blockhash');
  it.todo('should fetch the treasury wallet SOL balance');
  it.todo('should fetch the treasury USDC token account');
  it.todo('should handle an invalid RPC URL with a clear error');
});
