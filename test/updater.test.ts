import { mock } from 'jest-mock-extended';
import {
  BlockInfo,
  RuneBlockIndex,
  RuneEtching,
  RuneLocation,
  RuneUtxoBalance,
  RunestoneStorage,
} from '../src/indexer/types';
import { RuneUpdater, UpdaterTx } from '../src/indexer/updater';
import { BitcoinRpcClient } from '../src/rpcclient';
import { Network } from '../src/network';
import { Runestone } from '../src/runestone';
import { RuneId } from '../src/runeid';
import { Etching } from '../src/etching';
import { u128, u32, u64, u8 } from '../src/integer';
import { Some, None } from '../src/monads';
import { Rune } from '../src/rune';

function getDefaultRuneUpdaterContext() {
  const block = { hash: 'hash', height: 100_000, previousblockhash: 'previousblockhash' };
  const storage = new MemoryStorage();
  const rpc = mock<BitcoinRpcClient>();
  const runeUpdater = new RuneUpdater(Network.MAINNET, block, storage, rpc);
  return { runeUpdater, block, storage, rpc };
}

class MemoryStorage implements RunestoneStorage {
  etching: RuneEtching | null = null;
  mintCount: number = 0;
  runeId: RuneLocation | null = null;
  utxoBalances: RuneUtxoBalance[] = [];

  async connect(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async disconnect(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async getBlockhash(blockHeight: number): Promise<string | null> {
    throw new Error('Method not implemented.');
  }
  async getCurrentBlock(): Promise<BlockInfo | null> {
    throw new Error('Method not implemented.');
  }
  async resetCurrentBlock(block: BlockInfo): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async getEtching(runeLocation: string): Promise<RuneEtching | null> {
    return this.etching;
  }
  async getValidMintCount(runeLocation: string, blockhash: string): Promise<number> {
    return this.mintCount;
  }
  async getRuneLocation(rune: string): Promise<RuneLocation | null> {
    return this.runeId;
  }
  async getUtxoBalance(txid: string, vout: number): Promise<RuneUtxoBalance[]> {
    return this.utxoBalances;
  }

  async saveBlockIndex(runeBlockIndex: RuneBlockIndex): Promise<void> {}
}

function getDeployRunestoneHex({
  mint,
  pointer,
  edicts,
  etching,
}: {
  mint?: [number, number];
  pointer?: number;
  edicts?: {
    id: [number, number];
    amount: number;
    output: number;
  }[];
  etching?: {
    divisibility?: number;
    rune?: string;
    spacers?: number;
    symbol?: string;
    terms?: {
      amount: number;
      cap: number;
      height: { start?: number; end?: number };
      offset: { start?: number; end?: number };
    };
    premine?: number;
  };
}) {
  return new Runestone(
    mint !== undefined ? Some(new RuneId(u64(mint[0]), u32(mint[1]))) : None,
    pointer !== undefined ? Some(pointer) : None,
    edicts?.map((edict) => ({
      id: new RuneId(u64(edict.id[0]), u32(edict.id[1])),
      amount: u128(edict.amount),
      output: u32(edict.output),
    })) ?? [],
    etching !== undefined
      ? Some(
          new Etching(
            etching.divisibility !== undefined ? Some(u8(etching.divisibility)) : None,
            etching.rune !== undefined ? Some(Rune.fromString(etching.rune)) : None,
            etching.spacers !== undefined ? Some(u32(etching.spacers)) : None,
            etching.symbol !== undefined ? Some(etching.symbol) : None,
            etching.terms !== undefined
              ? Some({
                  amount: u128(etching.terms.amount),
                  cap: u128(etching.terms.cap),
                  height: [
                    etching.terms.height?.start !== undefined
                      ? Some(u64(etching.terms.height.start))
                      : None,
                    etching.terms.height?.end !== undefined
                      ? Some(u64(etching.terms.height.end))
                      : None,
                  ],
                })
              : None,
            etching.premine !== undefined ? Some(u128(etching.premine)) : None
          )
        )
      : None
  )
    .encipher()
    .toString('hex');
}

describe('deploy', () => {
  test('deploy is unsuccessful due to no commitment and rune specified', async () => {
    const { runeUpdater } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
      vout: [
        { scriptPubKey: { hex: getDeployRunestoneHex({ etching: { rune: 'AAAAAAAAAAAAAA' } }) } },
      ],
    };

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
  });

  test('deploy is unsuccessful due rune specified below minimum', async () => {
    const { runeUpdater } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
      vout: [{ scriptPubKey: { hex: getDeployRunestoneHex({ etching: { rune: 'AAAA' } }) } }],
    };

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
  });

  test('deploy is unsuccessful due rune specified is in reserved range', async () => {
    const { runeUpdater, rpc } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [
        {
          txid: 'parenttxid',
          vout: 1,
          txinwitness: ['10d6a37025600407fa66a90d28ef0cd104', 'dead'],
        },
      ],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({ etching: { rune: 'AAAAAAAAAAAAAAAAAAAAAAAAAAA' } }),
          },
        },
      ],
    };

    rpc.getrawtransaction.mockResolvedValue({
      result: {
        confirmations: 6,
        vout: [{}, { scriptPubKey: { type: 'witness_v1_taproot' } }],
      } as any,
      error: null,
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
  });

  test('deploy is unsuccessful due rune confirmation not mature', async () => {
    const { runeUpdater, rpc } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: ['08d6e3604a356bcf23', 'dead'] }],
      vout: [
        { scriptPubKey: { hex: getDeployRunestoneHex({ etching: { rune: 'AAAAAAAAAAAAAA' } }) } },
      ],
    };
    rpc.getrawtransaction.mockResolvedValue({
      result: {
        confirmations: 5,
        vout: [{}, { scriptPubKey: { type: 'witness_v1_taproot' } }],
      } as any,
      error: null,
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
  });

  test('deploy is unsuccessful due to rune already etched', async () => {
    const { runeUpdater, rpc, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: ['08d6e3604a356bcf23', 'dead'] }],
      vout: [
        { scriptPubKey: { hex: getDeployRunestoneHex({ etching: { rune: 'AAAAAAAAAAAAAA' } }) } },
      ],
    };
    rpc.getrawtransaction.mockResolvedValue({
      result: {
        confirmations: 6,
        vout: [{}, { scriptPubKey: { type: 'witness_v1_taproot' } }],
      } as any,
      error: null,
    });
    storage.getRuneLocation = async () => ({ block: 1, tx: 1 });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
  });

  test('deploy is sunuccessful when commitment is multiple data pushes', async () => {
    const { runeUpdater, rpc } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: ['04d6e3604a04356bcf23', 'dead'] }],
      vout: [
        { scriptPubKey: { hex: getDeployRunestoneHex({ etching: { rune: 'AAAAAAAAAAAAAA' } }) } },
      ],
    };
    rpc.getrawtransaction.mockResolvedValue({
      result: {
        confirmations: 6,
        vout: [{}, { scriptPubKey: { type: 'witness_v1_taproot' } }],
      } as any,
      error: null,
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
  });

  test('deploy is successful', async () => {
    const { runeUpdater, rpc } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: ['08d6e3604a356bcf23', 'dead'] }],
      vout: [
        { scriptPubKey: { hex: getDeployRunestoneHex({ etching: { rune: 'AAAAAAAAAAAAAA' } }) } },
      ],
    };
    rpc.getrawtransaction.mockResolvedValue({
      result: {
        confirmations: 6,
        vout: [{}, { scriptPubKey: { type: 'witness_v1_taproot' } }],
      } as any,
      error: null,
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(1);
    expect(runeUpdater.etchings[0]).toMatchObject({ valid: true, rune: 'AAAAAAAAAAAAAA' });
  });
  test('deploy is successful due to no commitment and rune unspecified', async () => {
    const { runeUpdater } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
      vout: [{ scriptPubKey: { hex: getDeployRunestoneHex({ etching: {} }) } }],
    };

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(1);
    expect(runeUpdater.etchings[0]).toMatchObject({
      valid: true,
      rune: 'AAAAAAAAAAAAAAAADBCSMALNGCU',
    });
  });

  test('deploy is successful but invalid due to cenotaph', async () => {
    const { runeUpdater, rpc } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: ['08d6e3604a356bcf23', 'dead'] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({ etching: { rune: 'AAAAAAAAAAAAAA' }, pointer: 123 }),
          },
        },
      ],
    };
    rpc.getrawtransaction.mockResolvedValue({
      result: {
        confirmations: 6,
        vout: [{}, { scriptPubKey: { type: 'witness_v1_taproot' } }],
      } as any,
      error: null,
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(1);
    expect(runeUpdater.etchings[0]).toMatchObject({ valid: false, rune: 'AAAAAAAAAAAAAA' });
  });

  test('deploy is successful with allocation', async () => {});
  test('deploy is successful with allocation to multiple outputs', async () => {});

  test('deploy is successful with terms, premine', async () => {});
  test('deploy is successful with terms, premine, output more than premine ok', async () => {});
  test('deploy is successful with terms, premine to multiple outputs', async () => {});
});

describe('mint', () => {
  test('mint is valid with no block height restrictions', async () => {});
  test('mint is valid/invalid with one or both of absolute/relative start', async () => {});
  test('mint is valid/invalid with one or both of absolute/relative end', async () => {});
  test('mint is valid/invalid with cap', async () => {});
  test('mint is valid with amount specified and outputs is under/equal/over', async () => {});
  test('mint is valid with amount with multiple outputs', async () => {});
});

describe('edict', () => {
  test('edict with invalid output is cenotaph', async () => {});
  test('edict with not all amount goes to native default', async () => {});
  test('edict with not all amount goes to runestone default', async () => {});
  test('edict with all outputs with 0 amount', async () => {});
  test('edict with all outputs with 0 amount after a specified amount beforehand', async () => {});
  test('edict with all outputs with specified amount', async () => {});
  test('edict with all outputs with specified amount not enough', async () => {});
});
