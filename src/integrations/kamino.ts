export type KaminoPosition = {
  vaultId: string;
  depositedUsdc: number;
  accruedYieldUsdc: number;
  totalUsdc: number; // depositedUsdc + accruedYieldUsdc
  updatedAt: string;
};

export type KaminoTxResult = {
  ok: true;
  amountUsdc: number;
  txId?: string;
};

export type KaminoClient = {
  getKaminoPosition(): Promise<KaminoPosition>;
  depositToKamino(amountUsdc: number): Promise<KaminoTxResult>;
  withdrawFromKamino(amountUsdc: number): Promise<KaminoTxResult>;
};

type KaminoHandlers = {
  getPosition?: () => Promise<KaminoPosition>;
  deposit?: (amountUsdc: number) => Promise<KaminoTxResult>;
  withdraw?: (amountUsdc: number) => Promise<KaminoTxResult>;
};

type KaminoOptions = {
  handlers?: KaminoHandlers;
};

function validateAmount(amount: number, label: string): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be a finite positive number, got: ${amount}`);
  }
}

const STUB_VAULT_ID = 'kamino-vault-placeholder';

export function createKaminoClient(options: KaminoOptions = {}): KaminoClient {
  const handlers = options.handlers ?? {};

  return {
    async getKaminoPosition(): Promise<KaminoPosition> {
      if (handlers.getPosition) return handlers.getPosition();
      return {
        vaultId: STUB_VAULT_ID,
        depositedUsdc: 0,
        accruedYieldUsdc: 0,
        totalUsdc: 0,
        updatedAt: new Date().toISOString(),
      };
    },

    async depositToKamino(amountUsdc: number): Promise<KaminoTxResult> {
      validateAmount(amountUsdc, 'depositToKamino amountUsdc');
      if (handlers.deposit) return handlers.deposit(amountUsdc);
      return { ok: true, amountUsdc };
    },

    async withdrawFromKamino(amountUsdc: number): Promise<KaminoTxResult> {
      validateAmount(amountUsdc, 'withdrawFromKamino amountUsdc');
      if (handlers.withdraw) return handlers.withdraw(amountUsdc);
      return { ok: true, amountUsdc };
    },
  };
}

export const kaminoClient = createKaminoClient();
