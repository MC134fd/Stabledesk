import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

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
