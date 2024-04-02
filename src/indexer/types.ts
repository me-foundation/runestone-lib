import { Network } from '../network';
import { BitcoinRpcClient } from '../rpcclient';

export interface RunestoneStorage {
  /**
   * Connect to the storage backend, called at indexer startup.
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the storage backend, called at indexer shutdown.
   */
  disconnect(): Promise<void>;

  /**
   * Get indexed block hash at specified block height
   * @param blockHeight the block height
   */
  getBlockhash(blockHeight: number): Promise<string | null>;

  /**
   * Get the most recently indexed block's index and hash stored in IRunestoneStorage.
   */
  getCurrentBlock(): Promise<BlockInfo | null>;

  /**
   * Reset the most recent index block to a previous block height/hash by unindexing all blocks
   * following the specified block (this is used to handle reorgs).
   * @param block the block height and hash to reset current block to
   */
  resetCurrentBlock(block: BlockInfo): Promise<void>;

  /**
   * Save new utxo balances for the given block.
   * @param balances the block with all the new utxo balances
   */
  saveBlockIndex(balances: RuneBlockIndex): Promise<void>;

  /**
   * Get the etching that deployed the rune if it exists.
   * @param rune rune string representation
   */
  getEtching(rune: string): Promise<RuneEtching | null>;

  /**
   * Get the total valid mint counts for rune.
   * @param rune rune string representation
   */
  getValidMintCount(rune: string): Promise<number>;

  /**
   * Get the rune balance for the given UTXO.
   * @param rune rune string representation
   * @param txid transaction id
   * @param vout output index in transaction
   */
  getUtxoBalance(rune: string, txid: string, vout: number): Promise<RuneUtxoBalance>;
}

export type RunestoneIndexerOptions = {
  bitcoinRpcClient: BitcoinRpcClient;

  network: Network;

  storage: RunestoneStorage;

  /**
   * The interval at which to poll the RPC for new blocks, in milliseconds.
   * Defaults to `10000` (10 seconds), and must be positive.
   */
  pollIntervalMs?: number;
};

export type BlockInfo = {
  height: number;
  hash: string;
};

export type RuneUtxoBalance = {
  txid: string;
  vout: number;
  address?: string;
  scriptPubKey: Buffer;
  rune: string;
  amount: bigint;
};

export type RuneEtchingSpec = {
  rune?: string;
  divisibility?: number;
  premine?: bigint;
  spacers?: number[];
  symbol?: string;
  terms?: {
    cap?: bigint;
    amount?: bigint;
    offset?: {
      start?: bigint;
      end?: bigint;
    };
    height?: {
      start?: bigint;
      end?: bigint;
    };
  };
};

export type RuneEtching = RuneEtchingSpec & {
  rune: string;
};

export type RuneMint = {
  rune: string;
  txid: string;
  valid: boolean;
};

export type RuneBlockIndex = {
  block: BlockInfo;
  etchings: RuneEtching[];
  mints: RuneMint[];
  utxoBalances: RuneUtxoBalance[];
};
