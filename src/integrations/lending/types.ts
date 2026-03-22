import type { Transaction } from "@solana/web3.js";

/** Unique identifier for a lending protocol */
export type ProtocolId = "kamino" | "marginfi" | "save" | "juplend";

/** A deposit position in a single protocol for a single token */
export interface LendingPosition {
  protocol: ProtocolId;
  /** Token symbol (e.g. "USDC") */
  token: string;
  /** Token mint address */
  mint: string;
  /** Deposited amount in the token's smallest unit */
  depositedAmount: bigint;
  /** Current supply APY as a decimal (0.05 = 5%) */
  supplyApy: number;
}

/** Summary of all positions across all protocols */
export interface LendingPortfolio {
  positions: LendingPosition[];
  /** Total deposited value per token (sum across protocols) */
  totalByToken: Map<string, bigint>;
  /** Total deposited value across all tokens (in micro-USDC equivalent, for display) */
  totalValueUsdc: bigint;
}

/** Unified interface that every lending protocol adapter must implement */
export interface LendingAdapter {
  readonly id: ProtocolId;
  readonly name: string;

  /**
   * Initialize / load on-chain state for this protocol.
   * Called once on startup and can be called again to refresh.
   */
  initialize(): Promise<void>;

  /**
   * Get all deposit positions for the treasury wallet across all supported tokens.
   */
  getPositions(): Promise<LendingPosition[]>;

  /**
   * Get the current supply APY for a specific token in this protocol.
   * Returns undefined if the token is not supported.
   */
  getSupplyApy(tokenSymbol: string): Promise<number | undefined>;

  /**
   * Build a deposit transaction for the given token and amount.
   * Amount is in the token's smallest unit (e.g. micro-USDC).
   */
  buildDepositTx(tokenSymbol: string, amount: bigint): Promise<Transaction>;

  /**
   * Build a withdraw transaction for the given token and amount.
   * Amount is in the token's smallest unit.
   */
  buildWithdrawTx(tokenSymbol: string, amount: bigint): Promise<Transaction>;

  /**
   * List token symbols supported by this protocol for lending.
   */
  supportedTokens(): string[];
}
