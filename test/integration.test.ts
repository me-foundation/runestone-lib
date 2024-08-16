import 'dotenv/config';
import { RPCClient } from 'rpc-bitcoin';
import {
  BlockIdentifier,
  RuneBlockIndex,
  RuneEtching,
  RuneLocation,
  RunestoneIndexer,
  RunestoneStorage,
  RuneUtxoBalance,
} from '../src/indexer';
import { Network } from '../src/network';
import {
  BitcoinRpcClient,
  GetBlockhashParams,
  GetBlockParams,
  GetBlockReturn,
  RpcResponse,
} from '../src/rpcclient';

const BITCOIN_RPC_HOST = process.env.BITCOIN_RPC_HOST || 'http://localhost';
const BITCOIN_RPC_PORT = Number(process.env.BITCOIN_RPC_PORT ?? 58332);
const BITCOIN_RPC_USER = process.env.BITCOIN_RPC_USER || '__cookie__';
const BITCOIN_RPC_PASS = process.env.BITCOIN_RPC_PASS || '';
const BITCOIN_RPC_TIMEOUT = Number(process.env.BITCOIN_RPC_TIMEOUT ?? 120000);

class InMemoryRunestoneStorage implements RunestoneStorage {
  private readonly blocks: BlockIdentifier[] = [];
  private readonly etchingsByLocation: Map<string, RuneEtching> = new Map();
  private readonly locationsByTicker: Map<string, RuneLocation> = new Map();
  private readonly balances: Map<string, (RuneUtxoBalance & { spentBlockHeight?: number })[][]> =
    new Map();
  private readonly validMintCounts: Map<string, number[]> = new Map();

  async connect() {}
  async disconnect() {}

  async getBlockhash(blockHeight: number): Promise<string | null> {
    return this.blocks[blockHeight].hash;
  }

  async getCurrentBlock(): Promise<BlockIdentifier | null> {
    return this.blocks[this.blocks.length - 1] ?? null;
  }

  async resetCurrentBlock(block: BlockIdentifier): Promise<void> {
    this.blocks.splice(block.height + 1, this.blocks.length - block.height - 1);
  }

  async seedEtchings(etchings: RuneEtching[]): Promise<void> {
    for (const etching of etchings) {
      this.etchingsByLocation.set(RuneLocation.toString(etching.runeId), etching);
    }
  }

  async saveBlockIndex({
    block,
    etchings,
    mintCounts,
    spentBalances,
    utxoBalances,
  }: RuneBlockIndex): Promise<void> {
    this.blocks[block.height] = block;

    for (const { mint, count } of mintCounts) {
      const runeLocation = RuneLocation.toString(mint);
      const mintCountsByHeight = this.validMintCounts.get(runeLocation) ?? [];
      this.validMintCounts.set(runeLocation, mintCountsByHeight);

      mintCountsByHeight[block.height] = count;
    }

    for (const etching of etchings) {
      const runeLocation = RuneLocation.toString(etching.runeId);
      this.etchingsByLocation.set(runeLocation, etching);
      this.locationsByTicker.set(etching.runeTicker, etching.runeId);
    }

    for (const utxoBalance of utxoBalances) {
      const vouts = this.balances.get(utxoBalance.txid) ?? [];
      this.balances.set(utxoBalance.txid, vouts);

      const balances = vouts[utxoBalance.vout] ?? [];
      vouts[utxoBalance.vout] = balances;

      balances.push(utxoBalance);
    }

    for (const spentBalance of spentBalances) {
      for (const balance of this.balances.get(spentBalance.txid)![spentBalance.vout]) {
        balance.spentBlockHeight = block.height;
      }
    }
  }

  async getEtching(runeLocation: string): Promise<RuneEtching | null> {
    return this.etchingsByLocation.get(runeLocation) ?? null;
  }

  async getValidMintCount(runeLocation: string, blockheight: number): Promise<number> {
    return (
      this.validMintCounts
        .get(runeLocation)
        ?.slice(0, blockheight + 1)
        .reduce((x, y) => (x ?? 0) + (y ?? 0), 0) ?? 0
    );
  }

  async getRuneLocation(runeTicker: string): Promise<RuneLocation | null> {
    return this.locationsByTicker.get(runeTicker) ?? null;
  }

  async getUtxoBalance(txid: string, vout: number): Promise<RuneUtxoBalance[]> {
    const utxoBalances = this.balances.get(txid)?.[vout] ?? [];
    return utxoBalances.filter((utxoBalance) => !utxoBalance.spentBlockHeight);
  }
}

class MemoizedClient implements BitcoinRpcClient {
  private readonly rpcclient = new RPCClient({
    url: BITCOIN_RPC_HOST,
    port: BITCOIN_RPC_PORT,
    user: BITCOIN_RPC_USER,
    pass: BITCOIN_RPC_PASS,
    timeout: BITCOIN_RPC_TIMEOUT,
    fullResponse: true,
  });

  private readonly getblockhashCache: RpcResponse<string>[] = [];
  private readonly getblockCache: Record<string, RpcResponse<GetBlockReturn<1>>> = {};

  async getblockhash({ height }: GetBlockhashParams): Promise<RpcResponse<string>> {
    if (this.getblockhashCache[height]) {
      return this.getblockhashCache[height];
    }

    const response = await this.rpcclient.getblockhash({ height });
    this.getblockhashCache[height] = response;
    return response;
  }

  async getblock<T extends GetBlockParams>({
    blockhash,
    verbosity,
  }: T): Promise<RpcResponse<GetBlockReturn<T>>> {
    verbosity = verbosity ?? 1;
    if (verbosity === 1 && this.getblockCache[blockhash]) {
      return this.getblockCache[blockhash] as RpcResponse<GetBlockReturn<T>>;
    }

    const response = await this.rpcclient.getblock({ blockhash, verbosity });
    if (verbosity === 1) {
      this.getblockCache[blockhash] = response;
    }
    return response;
  }
}

test(
  'integration',
  async () => {
    const indexer = new RunestoneIndexer({
      bitcoinRpcClient: new MemoizedClient(),
      network: Network.MAINNET,
      storage: new InMemoryRunestoneStorage(),
    });

    await indexer.start();
    await indexer.updateRuneUtxoBalances();
  },
  60 * 60 * 1000
);
