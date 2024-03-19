import { RPCClient } from 'rpc-bitcoin';
import { RunestoneEvent } from './events';

export interface IRunestoneIndexer {
  /**
   * Begin indexing the blockchain from the last checkpoint.
   */
  start(): Promise<void>;

  /**
   * Stop the indexer, waiting for any in-progress operations to complete before returning.
   */
  stop(): Promise<void>;
}

export interface IRunestoneStorage {
  /**
   * Connect to the storage backend, called at indexer startup.
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the storage backend, called at indexer shutdown.
   */
  disconnect(): Promise<void>;

  /**
   * Handle a Runestone event.
   * @param event The {@link RunestoneEvent} to handle.
   * @returns A promise that resolves to true if the event was handled without error, false otherwise.
   */
  handleEvent(event: RunestoneEvent): Promise<boolean>;

  /**
   * Called after each block is processed to save progress.
   * @param blockhash The hash of the block that was processed.
   * @param blockheight The height of the block that was processed.
   * @returns A promise that resolves to true if the checkpoint was saved without error, false otherwise.
   */
  saveCheckpoint(blockhash: string, blockheight: number): Promise<boolean>;

  /**
   * Called at startup to load the last saved checkpoint.
   * @returns A promise that resolves to an object containing the blockhash and blockheight of the last saved checkpoint.
   * If no checkpoint is found, returns null.
   */
  loadCheckpoint(): Promise<{ blockhash: string; blockheight: number } | null>;
}

export type RunestoneIndexerOptions = {
  bitcoinRpc: {
    url: string;
    user: string;
    pass: string;
    port: number;
  };
  storage: IRunestoneStorage;
  /**
   * The interval at which to poll the RPC for new blocks, in milliseconds.
   * Defaults to `10000` (10 seconds), and must be positive.
   */
  pollIntervalMs?: number;
};

export class RunestoneIndexer implements IRunestoneIndexer {
  private readonly _storage: IRunestoneStorage;
  private readonly _rpc: RPCClient;
  private readonly _pollIntervalMs: number;

  private _started: boolean;
  private _intervalId: NodeJS.Timeout | null = null;

  constructor(options: RunestoneIndexerOptions) {
    this._rpc = new RPCClient({
      url: options.bitcoinRpc.url,
      user: options.bitcoinRpc.user,
      pass: options.bitcoinRpc.pass,
      port: options.bitcoinRpc.port,
    });
    this._storage = options.storage;
    this._started = false;
    this._pollIntervalMs = Math.max(options.pollIntervalMs ?? 10000, 1);
  }

  async start(): Promise<void> {
    if (this._started) {
      return;
    }

    await this._storage.connect();
    const checkpoint = await this._storage.loadCheckpoint();

    this._started = true;
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
}
