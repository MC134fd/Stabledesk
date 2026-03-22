import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Connection } from '@solana/web3.js';
import { buildTreasuryState } from '../../src/core/treasury-state.js';
import { solanaClient } from '../../src/integrations/solana.js';
import * as usdcModule from '../../src/integrations/usdc.js';

const WALLET = '11111111111111111111111111111111';

// connection object is passed through to mocked methods — shape doesn't matter here
const conn = {} as Connection;

const zeroBalances: Record<string, number> = { USDC: 0, USDT: 0, PYUSD: 0, USDP: 0, GUSD: 0, FDUSD: 0 };

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
describe('buildTreasuryState — complete state object', () => {
  it('builds a complete treasury state with all required fields', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(3.5);
    vi.spyOn(usdcModule, 'fetchAllStablecoinBalances').mockResolvedValue({
      ...zeroBalances,
      USDC: 10.0,
    });

    const state = await buildTreasuryState(conn, WALLET);

    expect(state.treasuryWallet).toBe(WALLET);
    expect(state.solBalance).toBe(3.5);
    expect(state.usdcBalance).toBe(10.0);
    expect(state.pendingPaymentsCount).toBe(0);
    expect(state.pendingPaymentsTotal).toBe(0);
    expect(state.lastUpdatedAt).toBeTruthy();
    expect(state.tokenBalances).toBeDefined();
    expect(state.tokenBalances['USDC']).toBe(10.0);
  });

  it('lastUpdatedAt is a valid ISO 8601 timestamp', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(0);
    vi.spyOn(usdcModule, 'fetchAllStablecoinBalances').mockResolvedValue({ ...zeroBalances });

    const state = await buildTreasuryState(conn, WALLET);

    expect(() => new Date(state.lastUpdatedAt)).not.toThrow();
    expect(new Date(state.lastUpdatedAt).toISOString()).toBe(state.lastUpdatedAt);
  });
});

// ---------------------------------------------------------------------------
describe('buildTreasuryState — SOL balance', () => {
  it('reflects the SOL balance returned by solanaClient', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(42.0);
    vi.spyOn(usdcModule, 'fetchAllStablecoinBalances').mockResolvedValue({ ...zeroBalances });

    const state = await buildTreasuryState(conn, WALLET);

    expect(state.solBalance).toBe(42.0);
  });
});

// ---------------------------------------------------------------------------
describe('buildTreasuryState — USDC balance', () => {
  it('reflects the USDC balance from fetchAllStablecoinBalances', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(1);
    vi.spyOn(usdcModule, 'fetchAllStablecoinBalances').mockResolvedValue({
      ...zeroBalances,
      USDC: 250.0,
    });

    const state = await buildTreasuryState(conn, WALLET);

    expect(state.usdcBalance).toBe(250.0);
  });

  it('handles missing USDC account gracefully — usdcBalance is 0', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(1);
    vi.spyOn(usdcModule, 'fetchAllStablecoinBalances').mockResolvedValue({ ...zeroBalances });

    const state = await buildTreasuryState(conn, WALLET);

    expect(state.usdcBalance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('buildTreasuryState — Kamino balance', () => {
  it('defaults kaminoUsdcBalance to 0 when no provider supplied', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(1);
    vi.spyOn(usdcModule, 'fetchAllStablecoinBalances').mockResolvedValue({ ...zeroBalances });

    const state = await buildTreasuryState(conn, WALLET);

    expect(state.kaminoUsdcBalance).toBe(0);
  });

  it('reflects injected Kamino balance', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(1);
    vi.spyOn(usdcModule, 'fetchAllStablecoinBalances').mockResolvedValue({ ...zeroBalances });

    const state = await buildTreasuryState(conn, WALLET, undefined, async () => 5000);

    expect(state.kaminoUsdcBalance).toBe(5000);
  });

  it('totalUsdcExposure equals usdcBalance + kaminoUsdcBalance', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(1);
    vi.spyOn(usdcModule, 'fetchAllStablecoinBalances').mockResolvedValue({
      ...zeroBalances,
      USDC: 100,
    });

    const state = await buildTreasuryState(conn, WALLET, undefined, async () => 400);

    expect(state.usdcBalance).toBe(100);
    expect(state.kaminoUsdcBalance).toBe(400);
    expect(state.totalUsdcExposure).toBe(500);
  });

  it('totalUsdcExposure equals usdcBalance when Kamino balance is zero', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(1);
    vi.spyOn(usdcModule, 'fetchAllStablecoinBalances').mockResolvedValue({
      ...zeroBalances,
      USDC: 200,
    });

    const state = await buildTreasuryState(conn, WALLET);

    expect(state.totalUsdcExposure).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('buildTreasuryState — error propagation', () => {
  it('propagates error when getSolBalance throws', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockRejectedValue(new Error('RPC unavailable'));
    vi.spyOn(usdcModule, 'fetchAllStablecoinBalances').mockResolvedValue({ ...zeroBalances });

    await expect(buildTreasuryState(conn, WALLET)).rejects.toThrow('RPC unavailable');
  });

  it('propagates error when invalid wallet address is passed', async () => {
    // getSolBalance validates the address and throws before making any RPC call
    await expect(buildTreasuryState(conn, 'not-a-valid-key')).rejects.toThrow(
      'Invalid treasury wallet public key',
    );
  });
});

// ---------------------------------------------------------------------------
describe('buildTreasuryState — pending payments summary', () => {
  it('defaults to zero when no provider is supplied', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(1);
    vi.spyOn(usdcModule, 'fetchAllStablecoinBalances').mockResolvedValue({ ...zeroBalances });

    const state = await buildTreasuryState(conn, WALLET);

    expect(state.pendingPaymentsCount).toBe(0);
    expect(state.pendingPaymentsTotal).toBe(0);
  });

  it('incorporates count and total from the injected provider', async () => {
    vi.spyOn(solanaClient, 'getSolBalance').mockResolvedValue(1);
    vi.spyOn(usdcModule, 'fetchAllStablecoinBalances').mockResolvedValue({ ...zeroBalances });

    const state = await buildTreasuryState(conn, WALLET, () => ({
      count: 4,
      total: 1500,
    }));

    expect(state.pendingPaymentsCount).toBe(4);
    expect(state.pendingPaymentsTotal).toBe(1500);
  });
});
