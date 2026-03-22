import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Connection } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import { loadEnv } from '../../src/config/env.js';
import { solanaClient } from '../../src/integrations/solana.js';

// ---------------------------------------------------------------------------
// Environment config validation — all offline, no network calls
// ---------------------------------------------------------------------------
describe('loadEnv — environment config validation', () => {
  let savedRpcUrl: string | undefined;
  let savedWallet: string | undefined;

  beforeEach(() => {
    savedRpcUrl = process.env['SOLANA_RPC_URL'];
    savedWallet = process.env['TREASURY_WALLET_PUBLIC_KEY'];
    delete process.env['SOLANA_RPC_URL'];
    delete process.env['TREASURY_WALLET_PUBLIC_KEY'];
  });

  afterEach(() => {
    if (savedRpcUrl !== undefined) process.env['SOLANA_RPC_URL'] = savedRpcUrl;
    else delete process.env['SOLANA_RPC_URL'];

    if (savedWallet !== undefined) process.env['TREASURY_WALLET_PUBLIC_KEY'] = savedWallet;
    else delete process.env['TREASURY_WALLET_PUBLIC_KEY'];
  });

  it('throws when SOLANA_RPC_URL is missing', () => {
    process.env['TREASURY_WALLET_PUBLIC_KEY'] = '11111111111111111111111111111111';
    expect(() => loadEnv()).toThrow('SOLANA_RPC_URL');
  });

  it('throws when TREASURY_WALLET_PUBLIC_KEY is missing', () => {
    process.env['SOLANA_RPC_URL'] = 'https://api.devnet.solana.com';
    expect(() => loadEnv()).toThrow('TREASURY_WALLET_PUBLIC_KEY');
  });

  it('throws when SOLANA_RPC_URL is whitespace-only', () => {
    process.env['SOLANA_RPC_URL'] = '   ';
    process.env['TREASURY_WALLET_PUBLIC_KEY'] = '11111111111111111111111111111111';
    expect(() => loadEnv()).toThrow('SOLANA_RPC_URL');
  });

  it('trims whitespace from both values', () => {
    process.env['SOLANA_RPC_URL'] = '  https://api.devnet.solana.com  ';
    process.env['TREASURY_WALLET_PUBLIC_KEY'] = '  11111111111111111111111111111111  ';
    const config = loadEnv();
    expect(config.rpcUrl).toBe('https://api.devnet.solana.com');
    expect(config.treasuryWallet).toBe('11111111111111111111111111111111');
  });

  it('returns the correct shape when both vars are present', () => {
    process.env['SOLANA_RPC_URL'] = 'https://api.devnet.solana.com';
    process.env['TREASURY_WALLET_PUBLIC_KEY'] = '11111111111111111111111111111111';
    const config = loadEnv();
    expect(config).toHaveProperty('rpcUrl');
    expect(config).toHaveProperty('treasuryWallet');
  });
});

// ---------------------------------------------------------------------------
// PublicKey validation — offline, uses @solana/web3.js locally
// ---------------------------------------------------------------------------
describe('PublicKey validation', () => {
  it('throws on an invalid public key string', () => {
    expect(() => new PublicKey('not-a-valid-key')).toThrow();
  });

  it('accepts a valid base58 public key (system program)', () => {
    expect(() => new PublicKey('11111111111111111111111111111111')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Connection setup — offline, validates object shape only
// ---------------------------------------------------------------------------
describe('solanaClient — connection setup', () => {
  it('createConnection returns an object with a getSlot method', () => {
    const conn = solanaClient.createConnection('https://api.devnet.solana.com');
    expect(conn).toBeDefined();
    expect(typeof conn.getSlot).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// solanaClient.getCurrentSlot — offline, mock injected
// ---------------------------------------------------------------------------
describe('solanaClient — getCurrentSlot', () => {
  it('returns the slot number from the connection', async () => {
    const conn = { getSlot: vi.fn().mockResolvedValue(123456) } as unknown as Connection;
    const slot = await solanaClient.getCurrentSlot(conn);
    expect(slot).toBe(123456);
    expect(conn.getSlot).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// solanaClient.getSolBalance — offline, mock injected
// ---------------------------------------------------------------------------
describe('solanaClient — getSolBalance', () => {
  it('converts lamports to SOL correctly', async () => {
    const conn = {
      getBalance: vi.fn().mockResolvedValue(2_000_000_000), // 2 SOL in lamports
    } as unknown as Connection;
    const balance = await solanaClient.getSolBalance(conn, '11111111111111111111111111111111');
    expect(balance).toBe(2);
  });

  it('throws on an invalid wallet address', async () => {
    const conn = { getBalance: vi.fn() } as unknown as Connection;
    await expect(solanaClient.getSolBalance(conn, 'not-a-valid-key')).rejects.toThrow(
      'Invalid treasury wallet public key',
    );
    expect(conn.getBalance).not.toHaveBeenCalled();
  });

  it('returns 0 for a zero-lamport balance', async () => {
    const conn = { getBalance: vi.fn().mockResolvedValue(0) } as unknown as Connection;
    const balance = await solanaClient.getSolBalance(conn, '11111111111111111111111111111111');
    expect(balance).toBe(0);
  });
});
