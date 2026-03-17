import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Connection } from '@solana/web3.js';
import { buildTreasuryState } from '../../src/core/treasury-state.js';
import { solanaClient } from '../../src/integrations/solana.js';
import { usdcClient } from '../../src/integrations/usdc.js';

const WALLET = '11111111111111111111111111111111';
const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// connection object is passed through to mocked methods — shape doesn't matter here
const conn = {} as Connection;

const zeroUsdc = {
  treasuryWallet: WALLET,
  tokenAccount: 'some-ata-address',
  accountExists: false,
  rawAmount: 0n,
  uiAmount: 0,
} as const;

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
describe('buildTreasuryState — complete state object', () => {
  it('builds a complete treasury state with all required fields', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(3.5);
    vi.spyOn(usdcClient, 'getBalance').mockResolvedValue({
      ...zeroUsdc,
      accountExists: true,
      rawAmount: 10_000_000n,
      uiAmount: 10.0,
    });

    const state = await buildTreasuryState(conn, WALLET, USDC_MINT);

    expect(state.treasuryWallet).toBe(WALLET);
    expect(state.solBalance).toBe(3.5);
    expect(state.usdcBalance).toBe(10.0);
    expect(state.pendingPaymentsCount).toBe(0);
    expect(state.pendingPaymentsTotal).toBe(0);
    expect(state.lastUpdatedAt).toBeTruthy();
  });

  it('lastUpdatedAt is a valid ISO 8601 timestamp', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(0);
    vi.spyOn(usdcClient, 'getBalance').mockResolvedValue(zeroUsdc);

    const state = await buildTreasuryState(conn, WALLET, USDC_MINT);

    expect(() => new Date(state.lastUpdatedAt)).not.toThrow();
    expect(new Date(state.lastUpdatedAt).toISOString()).toBe(state.lastUpdatedAt);
  });
});

// ---------------------------------------------------------------------------
describe('buildTreasuryState — SOL balance', () => {
  it('reflects the SOL balance returned by solanaClient', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(42.0);
    vi.spyOn(usdcClient, 'getBalance').mockResolvedValue(zeroUsdc);

    const state = await buildTreasuryState(conn, WALLET, USDC_MINT);

    expect(state.solBalance).toBe(42.0);
  });
});

// ---------------------------------------------------------------------------
describe('buildTreasuryState — USDC balance', () => {
  it('reflects the USDC uiAmount returned by usdcClient', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(1);
    vi.spyOn(usdcClient, 'getBalance').mockResolvedValue({
      ...zeroUsdc,
      accountExists: true,
      rawAmount: 250_000_000n,
      uiAmount: 250.0,
    });

    const state = await buildTreasuryState(conn, WALLET, USDC_MINT);

    expect(state.usdcBalance).toBe(250.0);
  });

  it('handles missing USDC account gracefully — usdcBalance is 0', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(1);
    vi.spyOn(usdcClient, 'getBalance').mockResolvedValue(zeroUsdc); // accountExists: false

    const state = await buildTreasuryState(conn, WALLET, USDC_MINT);

    expect(state.usdcBalance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('buildTreasuryState — pending payments summary', () => {
  it('defaults to zero when no provider is supplied', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(1);
    vi.spyOn(usdcClient, 'getBalance').mockResolvedValue(zeroUsdc);

    const state = await buildTreasuryState(conn, WALLET, USDC_MINT);

    expect(state.pendingPaymentsCount).toBe(0);
    expect(state.pendingPaymentsTotal).toBe(0);
  });

  it('incorporates count and total from the injected provider', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(1);
    vi.spyOn(usdcClient, 'getBalance').mockResolvedValue(zeroUsdc);

    const state = await buildTreasuryState(conn, WALLET, USDC_MINT, () => ({
      count: 4,
      total: 1500,
    }));

    expect(state.pendingPaymentsCount).toBe(4);
    expect(state.pendingPaymentsTotal).toBe(1500);
  });
});
