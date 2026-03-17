import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
