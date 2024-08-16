import { RunestoneStorage, RunestoneIndexerOptions } from './types';
import { Network } from '../network';
import { BitcoinRpcClient } from '../rpcclient';
import { RuneUpdater } from './updater';
import { u128 } from '../integer';

export * from './types';
export { RuneUpdater } from './updater';

export class RunestoneIndexer {
  private readonly _storage: RunestoneStorage;
  private readonly _rpc: BitcoinRpcClient;
  private readonly _network: Network;

  private _started: boolean = false;
  private _updateInProgress: boolean = false;

  constructor(options: RunestoneIndexerOptions) {
    this._rpc = options.bitcoinRpcClient;
    this._storage = options.storage;
    this._network = options.network;
  }

  async start(): Promise<void> {
    if (this._started) {
      return;
    }

    await this._storage.connect();

    this._started = true;

    if (this._network === Network.MAINNET || this._network === Network.FRACTAL) {
      this._storage.seedEtchings([
        {
          runeTicker: 'UNCOMMONGOODS',
          runeName: 'UNCOMMON•GOODS',
          runeId: { block: 1, tx: 0 },
          txid: '0000000000000000000000000000000000000000000000000000000000000000',
          valid: true,
          symbol: '⧉',
          terms: { amount: 1n, cap: u128.MAX, height: { start: 840000n, end: 1050000n } },
        },
      ]);
    }
  }

  async stop(): Promise<void> {
    if (!this._started) {
      return;
    }

    await this._storage.disconnect();
    this._started = false;
  }

  async updateRuneUtxoBalances(): Promise<void> {
    if (!this._started) {
      throw new Error('Runestone indexer is not started');
    }

    if (this._updateInProgress) {
      return;
    }

    this._updateInProgress = true;
    try {
      await this.updateRuneUtxoBalancesImpl();
    } finally {
      this._updateInProgress = false;
    }
  }

  private async updateRuneUtxoBalancesImpl() {
    const currentStorageBlock = await this._storage.getCurrentBlock();
    if (currentStorageBlock) {
      // walk down until matching hash is found
      const reorgBlockhashesToIndex: string[] = [];
      let blockheight = currentStorageBlock.height;
      let blockhash = (await this._rpc.getblockhash({ height: blockheight })).result;
      let storageBlockHash: string | null = currentStorageBlock.hash;
      while (storageBlockHash !== blockhash) {
        if (blockhash) {
          reorgBlockhashesToIndex.push(blockhash);
        }

        blockheight--;
        blockhash = (await this._rpc.getblockhash({ height: blockheight })).result;
        storageBlockHash = await this._storage.getBlockhash(blockheight);
      }
      reorgBlockhashesToIndex.reverse();

      // process blocks that are reorgs
      for (const blockhash of reorgBlockhashesToIndex) {
        const blockResult = await this._rpc.getblock({ blockhash, verbosity: 2 });
        if (blockResult.error !== null) {
          throw blockResult.error;
        }
        const block = blockResult.result;

        const runeUpdater = new RuneUpdater(this._network, block, true, this._storage, this._rpc);

        for (const [txIndex, tx] of block.tx.entries()) {
          await runeUpdater.indexRunes(tx, txIndex);
        }

        await this._storage.saveBlockIndex(runeUpdater);
      }
    }

    // start from first rune height or next block height, whichever is greater
    let blockheight = Math.max(
      Network.getFirstRuneHeight(this._network),
      currentStorageBlock ? currentStorageBlock.height + 1 : 0
    );
    let blockhash = (await this._rpc.getblockhash({ height: blockheight })).result;
    while (blockhash !== null) {
      const blockResult = await this._rpc.getblock({ blockhash, verbosity: 2 });
      if (blockResult.error !== null) {
        throw blockResult.error;
      }
      const block = blockResult.result;

      const runeUpdater = new RuneUpdater(this._network, block, false, this._storage, this._rpc);

      for (const [txIndex, tx] of block.tx.entries()) {
        await runeUpdater.indexRunes(tx, txIndex);
      }

      await this._storage.saveBlockIndex(runeUpdater);

      blockheight++;
      blockhash = (await this._rpc.getblockhash({ height: blockheight })).result;
    }
  }
}
