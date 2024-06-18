import AbstractIndexerLifeCycle, {
  TxLifeCycleParams,
  BlockLifeCycleParams,
} from './AbstractIndexerLifeCycle';

class DefaultIndexerLifeCycle implements AbstractIndexerLifeCycle {
  async beforeTxIndex({ txIndex, block, tx }: TxLifeCycleParams): Promise<void> {
    console.log(
      `Indexing tx ${txIndex + 1}/${block.tx.length} in block ${block.height} ${block.hash}`
    );
  }
  async afterTxIndex({ txIndex, block, tx }: TxLifeCycleParams): Promise<void> {
    console.log(
      `Indexed tx ${txIndex + 1}/${block.tx.length} in block ${block.height} ${block.hash}`
    );
  }
  async beforeBlockIndex({ block }: BlockLifeCycleParams): Promise<void> {
    console.log(`Indexing block ${block.height} ${block.hash}`);
  }
  async afterBlockIndex({ block }: BlockLifeCycleParams): Promise<void> {
    console.log(`Indexed block ${block.height} ${block.hash}`);
  }
}

export default DefaultIndexerLifeCycle;
