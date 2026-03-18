import { describe, it, expect } from 'vitest';
import { createKaminoClient } from '../../src/integrations/kamino.js';

// All tests use injected handlers — no network/RPC calls

const FAKE_POSITION = {
  vaultId: 'vault-test',
  depositedUsdc: 10000,
  accruedYieldUsdc: 50,
  totalUsdc: 10050,
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function makeClient() {
  return createKaminoClient({
    handlers: {
      getPosition: async () => ({ ...FAKE_POSITION }),
      deposit: async (amount) => ({ ok: true as const, amountUsdc: amount, txId: 'tx-dep' }),
      withdraw: async (amount) => ({ ok: true as const, amountUsdc: amount, txId: 'tx-wit' }),
    },
  });
}

// ---------------------------------------------------------------------------
describe('createKaminoClient — amount validation', () => {
  it('rejects zero deposit', async () => {
    const client = makeClient();
    await expect(client.depositToKamino(0)).rejects.toThrow();
  });

  it('rejects negative deposit', async () => {
    const client = makeClient();
    await expect(client.depositToKamino(-100)).rejects.toThrow();
  });

  it('rejects NaN deposit', async () => {
    const client = makeClient();
    await expect(client.depositToKamino(NaN)).rejects.toThrow();
  });

  it('rejects zero withdraw', async () => {
    const client = makeClient();
    await expect(client.withdrawFromKamino(0)).rejects.toThrow();
  });

  it('rejects negative withdraw', async () => {
    const client = makeClient();
    await expect(client.withdrawFromKamino(-50)).rejects.toThrow();
  });

  it('rejects Infinity withdraw', async () => {
    const client = makeClient();
    await expect(client.withdrawFromKamino(Infinity)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe('createKaminoClient — position', () => {
  it('returns normalized position from injected handler', async () => {
    const client = makeClient();
    const pos = await client.getKaminoPosition();
    expect(pos.vaultId).toBe('vault-test');
    expect(pos.totalUsdc).toBe(pos.depositedUsdc + pos.accruedYieldUsdc);
    expect(typeof pos.updatedAt).toBe('string');
  });

  it('returns zero-balance position when no handler provided', async () => {
    const client = createKaminoClient(); // no handlers
    const pos = await client.getKaminoPosition();
    expect(pos.depositedUsdc).toBe(0);
    expect(pos.accruedYieldUsdc).toBe(0);
    expect(pos.totalUsdc).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('createKaminoClient — deposit / withdraw', () => {
  it('deposit resolves with ok and amountUsdc for a valid amount', async () => {
    const client = makeClient();
    const result = await client.depositToKamino(500);
    expect(result.ok).toBe(true);
    expect(result.amountUsdc).toBe(500);
  });

  it('withdraw resolves with ok and amountUsdc for a valid amount', async () => {
    const client = makeClient();
    const result = await client.withdrawFromKamino(250);
    expect(result.ok).toBe(true);
    expect(result.amountUsdc).toBe(250);
  });

  it('handler receives the exact amount passed by the caller', async () => {
    const received: number[] = [];
    const client = createKaminoClient({
      handlers: {
        deposit: async (amount) => { received.push(amount); return { ok: true as const, amountUsdc: amount }; },
      },
    });
    await client.depositToKamino(1234.56);
    expect(received).toEqual([1234.56]);
  });

  it('handler result (including txId) is returned to caller', async () => {
    const client = makeClient(); // makeClient returns txId: 'tx-dep' / 'tx-wit'
    const deposit = await client.depositToKamino(100);
    expect(deposit.txId).toBe('tx-dep');

    const withdraw = await client.withdrawFromKamino(50);
    expect(withdraw.txId).toBe('tx-wit');
  });

  it('deposit handler error propagates to caller', async () => {
    const client = createKaminoClient({
      handlers: { deposit: async () => { throw new Error('Vault locked'); } },
    });
    await expect(client.depositToKamino(100)).rejects.toThrow('Vault locked');
  });

  it('withdraw handler error propagates to caller', async () => {
    const client = createKaminoClient({
      handlers: { withdraw: async () => { throw new Error('Insufficient funds in vault'); } },
    });
    await expect(client.withdrawFromKamino(100)).rejects.toThrow('Insufficient funds');
  });

  it('position with non-zero yield — totalUsdc equals depositedUsdc + accruedYieldUsdc', async () => {
    const client = createKaminoClient({
      handlers: {
        getPosition: async () => ({
          vaultId: 'v1',
          depositedUsdc: 10000,
          accruedYieldUsdc: 250,
          totalUsdc: 10250,
          updatedAt: '2024-01-01T00:00:00.000Z',
        }),
      },
    });
    const pos = await client.getKaminoPosition();
    expect(pos.totalUsdc).toBe(pos.depositedUsdc + pos.accruedYieldUsdc);
    expect(pos.totalUsdc).toBe(10250);
  });
});
