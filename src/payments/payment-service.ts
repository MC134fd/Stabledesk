import { PublicKey, Transaction } from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import type { Payment, PaymentStatus, CreatePaymentInput, PendingPaymentsSummary } from './payment-types.js';
import { createPaymentStore, type PaymentStore } from './payment-store.js';
import { getStablecoin, type StablecoinConfig } from '../config/stablecoins.js';
import type { SolanaClient } from '../integrations/solana.js';
import { createLogger } from '../audit/logger.js';

const log = createLogger('payments');

// Allowed status transitions — terminal states have no outgoing edges
const TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  queued:              ['awaiting_liquidity', 'ready', 'failed'],
  awaiting_liquidity:  ['ready', 'failed'],
  ready:               ['processing', 'failed'],
  processing:          ['sent', 'failed'],
  failed:              ['queued'],
  sent:                [],
};

type ServiceOptions = {
  now?: () => string;
  generateId?: () => string;
};

export type PaymentService = {
  createPayment(input: CreatePaymentInput): Payment;
  getPayment(id: string): Payment | undefined;
  listPayments(): Payment[];
  listPendingPayments(): Payment[];
  updatePaymentStatus(id: string, nextStatus: PaymentStatus): Payment;
  summarizePendingPayments(): PendingPaymentsSummary;
  processPayment(id: string): Promise<Payment>;
};

type ServiceConfig = ServiceOptions & {
  store?: PaymentStore;
  solana?: SolanaClient;
  /** Optional: Kora client for gasless txs (future milestone) */
  kora?: unknown;
  /** Optional: USDC token client for transfers (future milestone) */
  usdc?: unknown;
  /** Optional: treasury state getter for liquidity checks */
  getState?: () => unknown;
  /** Optional: treasury policy */
  policy?: unknown;
};

let _counter = 0;
function defaultGenerateId(): string {
  return `pay_${Date.now()}_${++_counter}`;
}

function tokenProgramId(config: StablecoinConfig): PublicKey {
  return config.tokenProgram === 'token-2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

export function createPaymentService(
  configOrStore: ServiceConfig | PaymentStore = {},
  options: ServiceOptions = {},
): PaymentService {
  // Detect if first arg is a PaymentStore (has 'create' method) or a ServiceConfig
  let store: PaymentStore;
  let opts: ServiceOptions;
  let solana: SolanaClient | undefined;
  if (typeof (configOrStore as PaymentStore).create === 'function') {
    store = configOrStore as PaymentStore;
    opts = options;
  } else {
    const cfg = configOrStore as ServiceConfig;
    store = cfg.store ?? createPaymentStore();
    solana = cfg.solana;
    opts = { now: cfg.now ?? options.now, generateId: cfg.generateId ?? options.generateId };
  }

  const now = opts.now ?? (() => new Date().toISOString());
  const generateId = opts.generateId ?? defaultGenerateId;

  return {
    createPayment(input) {
      const recipient = input.recipient.trim();
      if (!recipient) throw new Error('recipient must not be empty');

      const { amount } = input;
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`amount must be a finite positive number, got: ${amount}`);
      }

      const currencySymbol = (input.currency ?? 'USDC').toUpperCase();
      const stablecoin = getStablecoin(currencySymbol);
      if (!stablecoin || !stablecoin.enabled) {
        throw new Error(`Unsupported or disabled token: ${currencySymbol}`);
      }

      const payment: Payment = {
        id: generateId(),
        recipient,
        amount,
        currency: stablecoin.symbol,
        mint: stablecoin.mint,
        decimals: stablecoin.decimals,
        status: 'queued',
        createdAt: now(),
        ...(input.dueAt !== undefined && { dueAt: input.dueAt }),
        ...(input.reference !== undefined && { reference: input.reference }),
      };

      return store.create(payment);
    },

    getPayment(id) {
      return store.getById(id);
    },

    listPayments() {
      return store.listAll();
    },

    listPendingPayments() {
      return store.listPending();
    },

    updatePaymentStatus(id, nextStatus) {
      const payment = store.getById(id);
      if (!payment) throw new Error(`Payment not found: "${id}"`);

      const allowed = TRANSITIONS[payment.status];
      if (!allowed.includes(nextStatus)) {
        throw new Error(
          `Invalid transition: "${payment.status}" -> "${nextStatus}"`,
        );
      }

      return store.updateStatus(id, nextStatus);
    },

    summarizePendingPayments() {
      return store.summarizePending();
    },

    async processPayment(id: string): Promise<Payment> {
      const payment = store.getById(id);
      if (!payment) throw new Error(`Payment not found: "${id}"`);
      if (payment.status !== 'ready' && payment.status !== 'queued') {
        return payment;
      }

      if (!solana) {
        throw new Error('Solana client not configured — cannot execute transfers');
      }

      // Transition to processing
      store.updateStatus(id, 'processing');

      try {
        const stablecoin = getStablecoin(payment.currency);
        if (!stablecoin) throw new Error(`Unknown token: ${payment.currency}`);

        const mintKey = new PublicKey(stablecoin.mint);
        const recipientKey = new PublicKey(payment.recipient);
        const programId = tokenProgramId(stablecoin);

        // Get or create recipient's ATA (treasury pays rent if needed)
        const recipientAta = await getOrCreateAssociatedTokenAccount(
          solana.connection,
          solana.keypair,      // payer
          mintKey,
          recipientKey,
          false,               // allowOwnerOffCurve
          'confirmed',
          undefined,
          programId,
        );

        // Derive treasury's ATA
        const treasuryAta = getAssociatedTokenAddressSync(
          mintKey,
          solana.keypair.publicKey,
          false,
          programId,
        );

        // Convert human amount to raw
        const amountRaw = BigInt(Math.round(payment.amount * (10 ** stablecoin.decimals)));

        // Build transfer instruction
        const tx = new Transaction().add(
          createTransferCheckedInstruction(
            treasuryAta,
            mintKey,
            recipientAta.address,
            solana.keypair.publicKey,
            amountRaw,
            stablecoin.decimals,
            [],
            programId,
          ),
        );

        const signature = await solana.sendAndConfirm(tx);

        log.info('Payment sent', { id, currency: payment.currency, amount: payment.amount, signature });
        return store.update(id, { status: 'sent', txSignature: signature });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        log.error('Payment failed', { id, error: reason });
        return store.update(id, { status: 'failed', failureReason: reason });
      }
    },
  };
}
