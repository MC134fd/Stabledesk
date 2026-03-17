import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Connection } from '@solana/web3.js';
import { usdcClient } from '../../src/integrations/usdc.js';

// Devnet USDC mint — safe public constant, no secrets
const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
// System program address — a valid, predictable public key
const VALID_WALLET = '11111111111111111111111111111111';

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// Invalid input validation
// ---------------------------------------------------------------------------
describe('usdcClient.getBalance — invalid inputs', () => {
  it('throws on an invalid treasury wallet address', async () => {
    const conn = {} as Connection;
    await expect(usdcClient.getBalance(conn, 'not-a-valid-key', USDC_MINT)).rejects.toThrow(
      'Invalid treasury wallet public key',
    );
  });

  it('throws on an invalid USDC mint address', async () => {
    const conn = {} as Connection;
    await expect(usdcClient.getBalance(conn, VALID_WALLET, 'bad-mint')).rejects.toThrow(
      'Invalid USDC mint public key',
    );
  });
});

// ---------------------------------------------------------------------------
// Missing token account — safe zero shape
// ---------------------------------------------------------------------------
describe('usdcClient.getBalance — account does not exist', () => {
  it('returns zero balance shape without throwing', async () => {
    const conn = {
      getTokenAccountBalance: vi.fn().mockRejectedValue(new Error('Account not found')),
    } as unknown as Connection;

    const result = await usdcClient.getBalance(conn, VALID_WALLET, USDC_MINT);

    expect(result.accountExists).toBe(false);
    expect(result.rawAmount).toBe(0n);
    expect(result.uiAmount).toBe(0);
    expect(result.treasuryWallet).toBe(VALID_WALLET);
    expect(result.tokenAccount).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Existing token account — normalized balance
// ---------------------------------------------------------------------------
describe('usdcClient.getBalance — account exists', () => {
  it('returns normalized balance structure', async () => {
    const conn = {
      getTokenAccountBalance: vi.fn().mockResolvedValue({
        value: { amount: '5000000', uiAmount: 5.0, decimals: 6 },
      }),
    } as unknown as Connection;

    const result = await usdcClient.getBalance(conn, VALID_WALLET, USDC_MINT);

    expect(result.accountExists).toBe(true);
    expect(result.rawAmount).toBe(5000000n);
    expect(result.uiAmount).toBe(5.0);
    expect(result.treasuryWallet).toBe(VALID_WALLET);
    expect(typeof result.tokenAccount).toBe('string');
  });

  it('represents raw amount as bigint to avoid floating-point loss', async () => {
    const conn = {
      getTokenAccountBalance: vi.fn().mockResolvedValue({
        value: { amount: '999999999999', uiAmount: 999999.999999, decimals: 6 },
      }),
    } as unknown as Connection;

    const result = await usdcClient.getBalance(conn, VALID_WALLET, USDC_MINT);

    expect(result.rawAmount).toBe(999999999999n);
    expect(typeof result.rawAmount).toBe('bigint');
  });
});

// ---------------------------------------------------------------------------
// Live devnet test — skipped by default
// ---------------------------------------------------------------------------
describe.skip('usdcClient.getBalance — live devnet (manual only)', () => {
  it('fetches real balance from devnet — requires SOLANA_RPC_URL and funded wallet', async () => {
    // Set SOLANA_RPC_URL and TREASURY_WALLET_PUBLIC_KEY before un-skipping
    const { Connection } = await import('@solana/web3.js');
    const rpcUrl = process.env['SOLANA_RPC_URL'] ?? 'https://api.devnet.solana.com';
    const wallet = process.env['TREASURY_WALLET_PUBLIC_KEY'] ?? VALID_WALLET;
    const conn = new Connection(rpcUrl, 'confirmed');
    const result = await usdcClient.getBalance(conn, wallet, USDC_MINT);
    expect(result.treasuryWallet).toBe(wallet);
    expect(typeof result.uiAmount).toBe('number');
  });
});
