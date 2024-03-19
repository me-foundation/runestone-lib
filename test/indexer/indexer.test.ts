import { mock } from 'jest-mock-extended';
import { IRunestoneStorage, RunestoneIndexer } from '../../src/indexer';

describe('RunestoneIndexer', () => {
  it('should start and stop', async () => {
    const storage = mock<IRunestoneStorage>();
    const indexer = new RunestoneIndexer({
      storage,
      bitcoinRpc: {
        url: 'http://localhost:8332',
        user: 'user',
        pass: 'pass',
        port: 8332,
      },
    });

    await indexer.start();

    expect(storage.connect).toHaveBeenCalledTimes(1);
    expect(storage.loadCheckpoint).toHaveBeenCalledTimes(1);

    await indexer.stop();

    expect(storage.disconnect).toHaveBeenCalledTimes(1);
  });
});
