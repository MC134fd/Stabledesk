import { loadEnv } from '../config/env.js';
import { solanaClient } from '../integrations/solana.js';

export const showState = async (): Promise<void> => {
  const config = loadEnv();
  const connection = solanaClient.createConnection(config.rpcUrl);
  const slot = await solanaClient.getCurrentSlot(connection);
  const balance = await solanaClient.getSolBalance(connection, config.treasuryWallet);

  console.log('StableDesk Milestone 1');
  console.log(`RPC URL:          ${config.rpcUrl}`);
  console.log(`Treasury Wallet:  ${config.treasuryWallet}`);
  console.log(`Current Slot:     ${slot}`);
  console.log(`SOL Balance:      ${balance} SOL`);
};

showState().catch((err: unknown) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
