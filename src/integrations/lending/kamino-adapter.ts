import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  KaminoMarket,
  KaminoAction,
  VanillaObligation,
  DEFAULT_RECENT_SLOT_DURATION_MS,
  PROGRAM_ID,
} from "@kamino-finance/klend-sdk";
import {
  createSolanaRpc,
  address,
  createKeyPairSignerFromBytes,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import type { SolanaClient } from "../solana.js";
import type { LendingAdapter, LendingPosition, ProtocolId } from "./types.js";
import { getEnabledStablecoins } from "../../config/stablecoins.js";
import { createLogger } from "../../audit/logger.js";

const log = createLogger("kamino");

/** Convert @solana/kit Instruction to legacy TransactionInstruction */
function toLegacyIx(ix: any): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a: any) => ({
      pubkey: new PublicKey(a.address),
      isSigner: a.role === 3 || a.role === 2,
      isWritable: a.role === 1 || a.role === 3,
    })),
    data: Buffer.from(ix.data ?? []),
  });
}

function kaminoActionToTx(action: any): Transaction {
  const tx = new Transaction();
  for (const ix of action.setupIxs) tx.add(toLegacyIx(ix));
  for (const ix of action.lendingIxs) tx.add(toLegacyIx(ix));
  for (const ix of action.cleanupIxs) tx.add(toLegacyIx(ix));
  return tx;
}

export function createKaminoAdapter(
  solana: SolanaClient,
  marketAddress: string,
  programId?: string,
): LendingAdapter {
  let market: KaminoMarket | null = null;
  let ownerSigner: KeyPairSigner | null = null;

  const marketAddr = address(marketAddress) as Address;
  const klendProgramId = programId ? address(programId) as Address : PROGRAM_ID;
  const rpc = createSolanaRpc(solana.connection.rpcEndpoint);
  const ownerAddr = address(solana.keypair.publicKey.toBase58()) as Address;

  async function getOwnerSigner(): Promise<KeyPairSigner> {
    if (!ownerSigner) {
      ownerSigner = await createKeyPairSignerFromBytes(
        solana.keypair.secretKey as unknown as Uint8Array,
      );
    }
    return ownerSigner;
  }

  async function ensureMarket(): Promise<KaminoMarket> {
    if (!market) {
      market = await KaminoMarket.load(
        rpc, marketAddr, DEFAULT_RECENT_SLOT_DURATION_MS, klendProgramId,
      );
      if (!market) throw new Error("Failed to load Kamino market");
      log.info("Kamino market loaded", { address: marketAddress });
    }
    return market;
  }

  return {
    id: "kamino" as ProtocolId,
    name: "Kamino Lend",

    async initialize() {
      await ensureMarket();
    },

    async getPositions(): Promise<LendingPosition[]> {
      const m = await ensureMarket();
      const obligation = await m.getUserVanillaObligation(ownerAddr);
      if (!obligation) return [];

      const positions: LendingPosition[] = [];
      const stables = getEnabledStablecoins();

      // Fetch slot once for all APY calculations
      let currentSlot = 0n;
      try {
        currentSlot = await rpc.getSlot({ commitment: "confirmed" }).send();
      } catch { /* slot stays 0 */ }

      for (const stable of stables) {
        const reserve = m.getReserveBySymbol(stable.symbol);
        if (!reserve) continue;

        const depositAmount = obligation.getDepositAmountByReserve(reserve);
        const amount = BigInt(Math.floor(Number(depositAmount) * (10 ** stable.decimals)));
        if (amount <= 0n) continue;

        let apy = 0;
        try {
          apy = reserve.totalSupplyAPY(currentSlot) ?? 0;
        } catch { /* apy stays 0 */ }

        positions.push({
          protocol: "kamino",
          token: stable.symbol,
          mint: stable.mint,
          depositedAmount: amount,
          supplyApy: apy,
        });
      }

      return positions;
    },

    async getSupplyApy(tokenSymbol: string): Promise<number | undefined> {
      const m = await ensureMarket();
      const reserve = m.getReserveBySymbol(tokenSymbol);
      if (!reserve) return undefined;
      try {
        const slot = await rpc.getSlot({ commitment: "confirmed" }).send();
        return reserve.totalSupplyAPY(slot) ?? 0;
      } catch {
        return 0;
      }
    },

    async buildDepositTx(tokenSymbol: string, amount: bigint): Promise<Transaction> {
      const m = await ensureMarket();
      const reserve = m.getReserveBySymbol(tokenSymbol);
      if (!reserve) throw new Error(`Kamino: ${tokenSymbol} reserve not found`);

      const signer = await getOwnerSigner();
      const action = await KaminoAction.buildDepositTxns(
        m, amount.toString(), reserve.getLiquidityMint(),
        signer, new VanillaObligation(klendProgramId),
        false, undefined,
      );

      log.info("Kamino deposit tx built", { token: tokenSymbol, amount: amount.toString() });
      return kaminoActionToTx(action);
    },

    async buildWithdrawTx(tokenSymbol: string, amount: bigint): Promise<Transaction> {
      const m = await ensureMarket();
      const reserve = m.getReserveBySymbol(tokenSymbol);
      if (!reserve) throw new Error(`Kamino: ${tokenSymbol} reserve not found`);

      const signer = await getOwnerSigner();
      const action = await KaminoAction.buildWithdrawTxns(
        m, amount.toString(), reserve.getLiquidityMint(),
        signer, new VanillaObligation(klendProgramId),
        false, undefined,
      );

      log.info("Kamino withdraw tx built", { token: tokenSymbol, amount: amount.toString() });
      return kaminoActionToTx(action);
    },

    supportedTokens(): string[] {
      // Kamino supports most major stablecoins
      return ["USDC", "USDT", "USDS", "PYUSD"];
    },
  };
}
