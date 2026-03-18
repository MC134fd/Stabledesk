import type { Transaction } from "@solana/web3.js";
import type {
  LendingAdapter,
  LendingPosition,
  LendingPortfolio,
  ProtocolId,
} from "./types.js";
import { createLogger } from "../../audit/logger.js";

const log = createLogger("lending-mgr");

/**
 * Lending Manager — aggregates all protocol adapters and provides
 * a unified view of the treasury's lending positions.
 *
 * Supports yield-optimized routing: when depositing, it picks the
 * protocol with the highest APY. When withdrawing, it picks the
 * protocol with the lowest APY (minimizing opportunity cost).
 */
export interface LendingManager {
  /** All registered adapters */
  adapters: Map<ProtocolId, LendingAdapter>;

  /** Initialize all adapters */
  initializeAll(): Promise<void>;

  /** Get all positions across all protocols */
  getPortfolio(): Promise<LendingPortfolio>;

  /** Get positions for a specific token across all protocols */
  getPositionsByToken(tokenSymbol: string): Promise<LendingPosition[]>;

  /** Get the best (highest) supply APY for a token across all protocols */
  getBestApy(tokenSymbol: string): Promise<{ protocol: ProtocolId; apy: number } | null>;

  /**
   * Build a deposit tx routed to the best-yield protocol for the given token.
   * Returns the protocol chosen and the transaction.
   */
  buildOptimalDepositTx(
    tokenSymbol: string,
    amount: bigint,
  ): Promise<{ protocol: ProtocolId; tx: Transaction }>;

  /**
   * Build a withdraw tx from the lowest-yield protocol for the given token
   * (minimizes opportunity cost). If amount exceeds one protocol's balance,
   * returns multiple transactions.
   */
  buildOptimalWithdrawTxs(
    tokenSymbol: string,
    amount: bigint,
  ): Promise<{ protocol: ProtocolId; tx: Transaction; amount: bigint }[]>;

  /** Build a deposit tx on a specific protocol */
  buildDepositTx(
    protocol: ProtocolId,
    tokenSymbol: string,
    amount: bigint,
  ): Promise<Transaction>;

  /** Build a withdraw tx on a specific protocol */
  buildWithdrawTx(
    protocol: ProtocolId,
    tokenSymbol: string,
    amount: bigint,
  ): Promise<Transaction>;

  /** Get all tokens supported by at least one protocol */
  allSupportedTokens(): string[];
}

export function createLendingManager(adapters: LendingAdapter[]): LendingManager {
  const adapterMap = new Map<ProtocolId, LendingAdapter>();
  for (const a of adapters) adapterMap.set(a.id, a);

  return {
    adapters: adapterMap,

    async initializeAll() {
      const results = await Promise.allSettled(
        adapters.map(async (a) => {
          try {
            await a.initialize();
            log.info(`${a.name} initialized`);
          } catch (e) {
            log.warn(`${a.name} failed to initialize`, { error: String(e) });
          }
        }),
      );
    },

    async getPortfolio(): Promise<LendingPortfolio> {
      const allPositions: LendingPosition[] = [];

      await Promise.allSettled(
        adapters.map(async (a) => {
          try {
            const positions = await a.getPositions();
            allPositions.push(...positions);
          } catch (e) {
            log.warn(`Failed to get positions from ${a.name}`, { error: String(e) });
          }
        }),
      );

      // Aggregate by token
      const totalByToken = new Map<string, bigint>();
      for (const p of allPositions) {
        const current = totalByToken.get(p.token) ?? 0n;
        totalByToken.set(p.token, current + p.depositedAmount);
      }

      // Total value (simplified: treat all stablecoins as $1)
      let totalValueUsdc = 0n;
      for (const amount of totalByToken.values()) {
        totalValueUsdc += amount;
      }

      return { positions: allPositions, totalByToken, totalValueUsdc };
    },

    async getPositionsByToken(tokenSymbol: string): Promise<LendingPosition[]> {
      const portfolio = await this.getPortfolio();
      return portfolio.positions.filter((p) => p.token === tokenSymbol);
    },

    async getBestApy(tokenSymbol: string): Promise<{ protocol: ProtocolId; apy: number } | null> {
      let best: { protocol: ProtocolId; apy: number } | null = null;

      await Promise.allSettled(
        adapters.map(async (a) => {
          if (!a.supportedTokens().includes(tokenSymbol)) return;
          try {
            const apy = await a.getSupplyApy(tokenSymbol);
            if (apy !== undefined && (!best || apy > best.apy)) {
              best = { protocol: a.id, apy };
            }
          } catch { /* skip */ }
        }),
      );

      return best;
    },

    async buildOptimalDepositTx(tokenSymbol: string, amount: bigint) {
      const best = await this.getBestApy(tokenSymbol);
      if (!best) throw new Error(`No protocol supports ${tokenSymbol} for lending`);

      const adapter = adapterMap.get(best.protocol);
      if (!adapter) throw new Error(`Adapter ${best.protocol} not found`);

      log.info("Optimal deposit routed", {
        token: tokenSymbol,
        protocol: best.protocol,
        apy: best.apy.toFixed(4),
        amount: amount.toString(),
      });

      const tx = await adapter.buildDepositTx(tokenSymbol, amount);
      return { protocol: best.protocol, tx };
    },

    async buildOptimalWithdrawTxs(tokenSymbol: string, amount: bigint) {
      // Get positions for this token, sorted by APY ascending (withdraw from lowest first)
      const positions = await this.getPositionsByToken(tokenSymbol);
      positions.sort((a, b) => a.supplyApy - b.supplyApy);

      const results: { protocol: ProtocolId; tx: Transaction; amount: bigint }[] = [];
      let remaining = amount;

      for (const pos of positions) {
        if (remaining <= 0n) break;

        const withdrawAmount = remaining > pos.depositedAmount
          ? pos.depositedAmount
          : remaining;

        if (withdrawAmount <= 0n) continue;

        const adapter = adapterMap.get(pos.protocol);
        if (!adapter) continue;

        try {
          const tx = await adapter.buildWithdrawTx(tokenSymbol, withdrawAmount);
          results.push({ protocol: pos.protocol, tx, amount: withdrawAmount });
          remaining -= withdrawAmount;

          log.info("Optimal withdraw routed", {
            token: tokenSymbol,
            protocol: pos.protocol,
            apy: pos.supplyApy.toFixed(4),
            amount: withdrawAmount.toString(),
          });
        } catch (e) {
          log.warn(`Failed to build withdraw from ${pos.protocol}`, { error: String(e) });
        }
      }

      if (remaining > 0n) {
        log.warn("Could not fully satisfy withdrawal", {
          token: tokenSymbol,
          remaining: remaining.toString(),
        });
      }

      return results;
    },

    async buildDepositTx(protocol: ProtocolId, tokenSymbol: string, amount: bigint) {
      const adapter = adapterMap.get(protocol);
      if (!adapter) throw new Error(`Adapter ${protocol} not found`);
      return adapter.buildDepositTx(tokenSymbol, amount);
    },

    async buildWithdrawTx(protocol: ProtocolId, tokenSymbol: string, amount: bigint) {
      const adapter = adapterMap.get(protocol);
      if (!adapter) throw new Error(`Adapter ${protocol} not found`);
      return adapter.buildWithdrawTx(tokenSymbol, amount);
    },

    allSupportedTokens(): string[] {
      const tokens = new Set<string>();
      for (const a of adapters) {
        for (const t of a.supportedTokens()) tokens.add(t);
      }
      return [...tokens];
    },
  };
}
