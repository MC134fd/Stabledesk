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
import type { SolanaClient } from "./solana.js";
import { createLogger } from "../audit/logger.js";

const log = createLogger("kamino");

export interface KaminoPosition {
  /** USDC deposited (micro-USDC including accrued yield) */
  depositedUsdc: bigint;
  /** Whether the user has an active obligation */
  hasObligation: boolean;
}

export interface KaminoClient {
  /** Load/refresh market data. Must be called before other operations. */
  loadMarket(): Promise<void>;
  /** Get current USDC deposit position for the treasury wallet */
  getPosition(): Promise<KaminoPosition>;
  /** Build deposit instruction for USDC amount (micro-USDC) */
  buildDepositTx(amountMicroUsdc: bigint): Promise<Transaction>;
  /** Build withdraw instruction for USDC amount (micro-USDC) */
  buildWithdrawTx(amountMicroUsdc: bigint): Promise<Transaction>;
}

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

export function createKaminoClient(
  solana: SolanaClient,
  marketAddress: string,
  programId?: string,
): KaminoClient {
  let market: KaminoMarket | null = null;
  let ownerSigner: KeyPairSigner | null = null;

  const marketAddr = address(marketAddress) as Address;
  const klendProgramId = programId ? address(programId) as Address : PROGRAM_ID;
  const rpc = createSolanaRpc(solana.connection.rpcEndpoint);

  async function getOwnerSigner(): Promise<KeyPairSigner> {
    if (!ownerSigner) {
      ownerSigner = await createKeyPairSignerFromBytes(
        solana.keypair.secretKey as unknown as Uint8Array,
      );
    }
    return ownerSigner;
  }

  return {
    async loadMarket() {
      market = await KaminoMarket.load(
        rpc,
        marketAddr,
        DEFAULT_RECENT_SLOT_DURATION_MS,
        klendProgramId,
      );
      if (!market) throw new Error("Failed to load Kamino market");
      log.info("Kamino market loaded", { address: marketAddress });
    },

    async getPosition(): Promise<KaminoPosition> {
      if (!market) await this.loadMarket();

      const ownerAddr = address(solana.keypair.publicKey.toBase58()) as Address;
      const obligation = await market!.getUserVanillaObligation(ownerAddr);
      if (!obligation) {
        return { depositedUsdc: 0n, hasObligation: false };
      }

      const usdcReserve = market!.getReserveBySymbol("USDC");
      if (!usdcReserve) {
        log.warn("USDC reserve not found in Kamino market");
        return { depositedUsdc: 0n, hasObligation: true };
      }

      const depositAmount = obligation.getDepositAmountByReserve(usdcReserve);
      // depositAmount is in token units (decimal). Convert to micro-USDC.
      const depositedUsdc = BigInt(Math.floor(Number(depositAmount) * 1_000_000));

      log.debug("Kamino position fetched", {
        depositedUsdc: depositedUsdc.toString(),
      });

      return { depositedUsdc, hasObligation: true };
    },

    async buildDepositTx(amountMicroUsdc: bigint): Promise<Transaction> {
      if (!market) await this.loadMarket();

      const usdcReserve = market!.getReserveBySymbol("USDC");
      if (!usdcReserve) throw new Error("USDC reserve not found in Kamino market");

      const signer = await getOwnerSigner();

      const kaminoAction = await KaminoAction.buildDepositTxns(
        market!,
        amountMicroUsdc.toString(),
        usdcReserve.getLiquidityMint(),
        signer,
        new VanillaObligation(klendProgramId),
        false, // useV2Ixs
        undefined, // scopeRefreshConfig
      );

      const tx = new Transaction();
      for (const ix of kaminoAction.setupIxs) tx.add(toLegacyIx(ix));
      for (const ix of kaminoAction.lendingIxs) tx.add(toLegacyIx(ix));
      for (const ix of kaminoAction.cleanupIxs) tx.add(toLegacyIx(ix));

      log.info("Kamino deposit tx built", { amount: amountMicroUsdc.toString() });
      return tx;
    },

    async buildWithdrawTx(amountMicroUsdc: bigint): Promise<Transaction> {
      if (!market) await this.loadMarket();

      const usdcReserve = market!.getReserveBySymbol("USDC");
      if (!usdcReserve) throw new Error("USDC reserve not found in Kamino market");

      const signer = await getOwnerSigner();

      const kaminoAction = await KaminoAction.buildWithdrawTxns(
        market!,
        amountMicroUsdc.toString(),
        usdcReserve.getLiquidityMint(),
        signer,
        new VanillaObligation(klendProgramId),
        false, // useV2Ixs
        undefined, // scopeRefreshConfig
      );

      const tx = new Transaction();
      for (const ix of kaminoAction.setupIxs) tx.add(toLegacyIx(ix));
      for (const ix of kaminoAction.lendingIxs) tx.add(toLegacyIx(ix));
      for (const ix of kaminoAction.cleanupIxs) tx.add(toLegacyIx(ix));

      log.info("Kamino withdraw tx built", { amount: amountMicroUsdc.toString() });
      return tx;
    },
  };
}
