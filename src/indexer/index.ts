import { RunestoneStorage, RuneBlockIndex, RunestoneIndexerOptions } from './types';
import { Network } from '../network';
import { BitcoinRpcClient } from '../rpcclient';

export * from './types';

export class RunestoneIndexer {
  private readonly _storage: RunestoneStorage;
  private readonly _rpc: BitcoinRpcClient;
  private readonly _network: Network;
  private readonly _pollIntervalMs: number;

  private _started: boolean = false;
  private _intervalId: NodeJS.Timeout | null = null;

  constructor(options: RunestoneIndexerOptions) {
    this._rpc = options.bitcoinRpcClient;
    this._storage = options.storage;
    this._network = options.network;
    this._pollIntervalMs = Math.max(options.pollIntervalMs ?? 10000, 1);
  }

  async start(): Promise<void> {
    if (this._started) {
      return;
    }

    await this._storage.connect();

    this._started = true;

    this._intervalId = setInterval(() => this.updateRuneUtxoBalances(), this._pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (!this._started) {
      return;
    }

    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }

    await this._storage.disconnect();
    this._started = false;
  }

  private async updateRuneUtxoBalances() {
    const newBlockhashesToIndex: string[] = [];

    const currentStorageBlock = await this._storage.getCurrentBlock();
    if (currentStorageBlock != null) {
      // If rpc block indexing is ahead of our storage, let's save up all block hashes
      // until we arrive back to the current storage's block tip.
      const bestblockhash: string = await this._rpc.getbestblockhash();
      let rpcBlock = await this._rpc.getblock({
        blockhash: bestblockhash,
        verbosity: 1,
      });
      while (rpcBlock.height > currentStorageBlock.height) {
        newBlockhashesToIndex.push(rpcBlock.hash);

        rpcBlock = await this._rpc.getblock({
          blockhash: rpcBlock.previousblockhash,
          verbosity: 1,
        });
      }

      // Handle edge case where storage block height is higher than rpc node block
      // (such as pointing to a newly indexing rpc node)
      let storageBlockhash =
        currentStorageBlock && currentStorageBlock.height === rpcBlock.height
          ? currentStorageBlock.hash
          : await this._storage.getBlockhash(rpcBlock.height);

      // Now rpc and storage blocks are at the same height,
      // iterate until they are also the same hash
      while (rpcBlock.hash !== storageBlockhash) {
        newBlockhashesToIndex.push(rpcBlock.hash);

        rpcBlock = await this._rpc.getblock({
          blockhash: rpcBlock.previousblockhash,
          verbosity: 1,
        });
        storageBlockhash = await this._storage.getBlockhash(rpcBlock.height);
      }

      // We can reset our storage state to where rpc node and storage matches
      if (currentStorageBlock && currentStorageBlock.hash !== rpcBlock.hash) {
        await this._storage.resetCurrentBlock(rpcBlock);
      }
    } else {
      const firstRuneHeight = Network.getFirstRuneHeight(this._network);

      // Iterate through the rpc blocks until we reach first rune height
      const bestblockhash: string = await this._rpc.getbestblockhash();
      let rpcBlock = await this._rpc.getblock({
        blockhash: bestblockhash,
        verbosity: 1,
      });
      while (rpcBlock.height >= firstRuneHeight) {
        newBlockhashesToIndex.push(rpcBlock.hash);

        rpcBlock = await this._rpc.getblock({
          blockhash: rpcBlock.previousblockhash,
          verbosity: 1,
        });
      }
    }

    // Finally start processing balances using newBlockhashesToIndex
    let blockhash = newBlockhashesToIndex.pop();
    while (blockhash !== undefined) {
      const block = await this._rpc.getblock({ blockhash, verbosity: 2 });
      const runeBlockIndex: RuneBlockIndex = {
        block,
        etchings: [],
        mints: [],
        utxoBalances: [],
      };

      // TODO: implement retrieving etchings, mints, and utxo balances
      // look through each transaction
      // check if any runestones
      // also check if any balances on inputs
      // if balance with no runestone, done, transfer to first non op return output

      await this._storage.saveBlockIndex(runeBlockIndex);
      blockhash = newBlockhashesToIndex.pop();
    }
  }
}
