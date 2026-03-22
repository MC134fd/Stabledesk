import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

export type SolanaClient = {
  connection: Connection;
  keypair: Keypair;
  sendAndConfirm(tx: Transaction): Promise<string>;
};

export const solanaClient = {
  createConnection(rpcUrl: string): Connection {
    return new Connection(rpcUrl, 'confirmed');
  },

  async getCurrentSlot(connection: Connection): Promise<number> {
    return connection.getSlot();
  },

  async getSolBalance(connection: Connection, walletAddress: string): Promise<number> {
    let publicKey: PublicKey;
    try {
      publicKey = new PublicKey(walletAddress);
    } catch {
      throw new Error(`Invalid treasury wallet public key: "${walletAddress}"`);
    }
    const lamports = await connection.getBalance(publicKey);
    return lamports / LAMPORTS_PER_SOL;
  },
};

export function createSolanaClient(rpcUrl: string, keypairB58: string): SolanaClient {
  const connection = new Connection(rpcUrl, 'confirmed');
  const secretKey = bs58.decode(keypairB58);
  const keypair = Keypair.fromSecretKey(secretKey);

  return {
    connection,
    keypair,

    async sendAndConfirm(tx: Transaction): Promise<string> {
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = keypair.publicKey;
      tx.partialSign(keypair);

      // Simulate first to get detailed logs on failure
      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        const logs = sim.value.logs ?? [];
        console.error('[solana] Simulation failed. Logs:', logs);
        throw new Error(
          `Transaction simulation failed: ${JSON.stringify(sim.value.err)}. Logs:\n${logs.join('\n')}`,
        );
      }

      const raw = tx.serialize();
      const signature = await connection.sendRawTransaction(raw);
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );
      return signature;
    },
  };
}
