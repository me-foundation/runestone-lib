import { Tx, GetBlockReturn } from '../rpcclient';

export type BlockLifeCycleParams = {
  block: GetBlockReturn<{ verbosity: 2 }>;
};

export type TxLifeCycleParams = {
  txIndex: number;
  tx: Tx;
} & BlockLifeCycleParams;

export default abstract class AbstractIndexerLifeCycle {
  async beforeTxIndex({ txIndex, tx, block }: TxLifeCycleParams): Promise<void> {}
  async afterTxIndex({ txIndex, tx, block }: TxLifeCycleParams): Promise<void> {}
  async beforeBlockIndex({ block }: BlockLifeCycleParams): Promise<void> {}
  async afterBlockIndex({ block }: BlockLifeCycleParams): Promise<void> {}
}
