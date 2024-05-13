import { mock } from 'jest-mock-extended';
import { RunestoneStorage } from '../src/indexer/types';
import { RuneUpdater, UpdaterTx } from '../src/indexer/updater';
import { BitcoinRpcClient } from '../src/rpcclient';
import { Network } from '../src/network';
import { MAGIC_EDEN_OUTPUT, getDeployRunestoneHex } from './fixtures';
import { OP_RETURN, TAPROOT_SCRIPT_PUBKEY_TYPE } from '../src/constants';
import * as _ from 'lodash';

function getDefaultRuneUpdaterContext() {
  const block = {
    hash: 'hash',
    height: 100_000,
    previousblockhash: 'previousblockhash',
    time: 123,
  };

  const storage = mock<RunestoneStorage>();
  storage.getEtching.mockResolvedValue(null);
  storage.getValidMintCount.mockResolvedValue(0);
  storage.getRuneLocation.mockResolvedValue(null);
  storage.getUtxoBalance.mockResolvedValue([]);

  const rpc = mock<BitcoinRpcClient>();

  const runeUpdater = new RuneUpdater(Network.MAINNET, block, false, storage, rpc);

  return { runeUpdater, block, storage, rpc };
}

describe('deploy', () => {
  test('deploy is unsuccessful due to no commitment and rune specified', async () => {
    const { runeUpdater } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
      vout: [
        { scriptPubKey: { hex: getDeployRunestoneHex({ etching: { rune: 'AAAAAAAAAAAAAA' } }) }, value: 0 },
      ],
    };

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
  });

  test('deploy is unsuccessful due rune specified below minimum', async () => {
    const { runeUpdater } = getDefaultRuneUpdaterContext();

    await runeUpdater.indexRunes(
      {
        txid: 'txid',
        vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
        vout: [{ scriptPubKey: { hex: getDeployRunestoneHex({ etching: { rune: 'AAAA' } }) }, value: 0 }],
      },
      88
    );
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
          value: 0,
        },
      ],
    };

    rpc.getrawtransaction.mockResolvedValue({
      result: {
        confirmations: 6,
        vout: [{}, { scriptPubKey: { type: TAPROOT_SCRIPT_PUBKEY_TYPE } }],
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
        { scriptPubKey: { hex: getDeployRunestoneHex({ etching: { rune: 'AAAAAAAAAAAAAA' } }) }, value: 0 },
      ],
    };
    rpc.getrawtransaction.mockResolvedValue({
      result: {
        blockhash: 'etchingblockhash',
        confirmations: 5,
        vout: [{}, { scriptPubKey: { type: TAPROOT_SCRIPT_PUBKEY_TYPE } }],
      } as any,
      error: null,
    });
    rpc.getblock.mockResolvedValue({
      result: { height: 99996 } as any,
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
        { scriptPubKey: { hex: getDeployRunestoneHex({ etching: { rune: 'AAAAAAAAAAAAAA' } }) }, value: 0 },
      ],
    };
    rpc.getrawtransaction.mockResolvedValue({
      result: {
        confirmations: 6,
        vout: [{}, { scriptPubKey: { type: TAPROOT_SCRIPT_PUBKEY_TYPE } }],
      } as any,
      error: null,
    });
    storage.getRuneLocation.mockResolvedValue({ block: 1, tx: 1 });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
  });

  test('deploy is sunuccessful when commitment is multiple data pushes', async () => {
    const { runeUpdater, rpc } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: ['04d6e3604a04356bcf23', 'dead'] }],
      vout: [
        { scriptPubKey: { hex: getDeployRunestoneHex({ etching: { rune: 'AAAAAAAAAAAAAA' } }) }, value: 0 },
      ],
    };
    rpc.getrawtransaction.mockResolvedValue({
      result: {
        confirmations: 6,
        vout: [{}, { scriptPubKey: { type: TAPROOT_SCRIPT_PUBKEY_TYPE } }],
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
        { scriptPubKey: { hex: getDeployRunestoneHex({ etching: { rune: 'AAAAAAAAAAAAAA' } }) }, value: 0 },
      ],
    };
    rpc.getrawtransaction.mockResolvedValue({
      result: {
        blockhash: 'etchingblockhash',
        vout: [{}, { scriptPubKey: { type: TAPROOT_SCRIPT_PUBKEY_TYPE } }],
      } as any,
      error: null,
    });
    rpc.getblock.mockResolvedValue({
      result: { height: 99995 } as any,
      error: null,
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(1);
    expect(runeUpdater.etchings[0]).toMatchObject({ valid: true, runeTicker: 'AAAAAAAAAAAAAA' });
  });

  test('deploy is successful due to no commitment and rune unspecified', async () => {
    const { runeUpdater } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
      vout: [{ scriptPubKey: { hex: getDeployRunestoneHex({ etching: {} }) }, value: 0 }],
    };

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(1);
    expect(runeUpdater.etchings[0]).toMatchObject({
      valid: true,
      runeTicker: 'AAAAAAAAAAAAAAAADBCSMALNGCU',
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
          value: 0,
        },
      ],
    };
    rpc.getrawtransaction.mockResolvedValue({
      result: {
        blockhash: 'etchingblockhash',
        vout: [{}, { scriptPubKey: { type: TAPROOT_SCRIPT_PUBKEY_TYPE } }],
      } as any,
      error: null,
    });
    rpc.getblock.mockResolvedValue({
      result: { height: 99995 } as any,
      error: null,
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(1);
    expect(runeUpdater.etchings[0]).toMatchObject({
      valid: false,
      runeTicker: 'AAAAAAAAAAAAAA',
    });
  });

  test('deploy is successful with allocation', async () => {
    const { runeUpdater } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({
              etching: { premine: 123 },
              edicts: [{ id: [0, 0], amount: 123, output: 1 }],
            }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
      ],
    };

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(1);
    expect(runeUpdater.utxoBalances.length).toBe(1);
    expect(runeUpdater.utxoBalances[0]).toMatchObject({
      txid: 'txid',
      vout: 1,
      runeTicker: 'AAAAAAAAAAAAAAAADBCSMALNGCU',
      runeId: {
        block: 100000,
        tx: 88,
      },
      amount: 123n,
    });
  });

  test('deploy is successful with allocation to multiple outputs', async () => {
    const { runeUpdater } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({
              etching: { premine: 123 },
              edicts: [
                { id: [0, 0], amount: 111, output: 1 },
                { id: [0, 0], amount: 11, output: 2 },
                { id: [0, 0], amount: 1, output: 3 },
              ],
            }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
      ],
    };

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(1);
    expect(runeUpdater.utxoBalances.length).toBe(3);
    expect(runeUpdater.utxoBalances[0]).toMatchObject({
      txid: 'txid',
      vout: 1,
      runeTicker: 'AAAAAAAAAAAAAAAADBCSMALNGCU',
      runeId: {
        block: 100000,
        tx: 88,
      },
      amount: 111n,
    });
    expect(runeUpdater.utxoBalances[1]).toMatchObject({
      txid: 'txid',
      vout: 2,
      runeTicker: 'AAAAAAAAAAAAAAAADBCSMALNGCU',
      runeId: {
        block: 100000,
        tx: 88,
      },
      amount: 11n,
    });
    expect(runeUpdater.utxoBalances[2]).toMatchObject({
      txid: 'txid',
      vout: 3,
      runeTicker: 'AAAAAAAAAAAAAAAADBCSMALNGCU',
      runeId: {
        block: 100000,
        tx: 88,
      },
      amount: 1n,
    });
  });

  test('deploy is successful with terms, premine, output more than premine ok', async () => {
    const { runeUpdater } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({
              etching: { premine: 123 },
              edicts: [{ id: [0, 0], amount: 500, output: 1 }],
            }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
      ],
    };

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(1);
    expect(runeUpdater.utxoBalances.length).toBe(1);
    expect(runeUpdater.utxoBalances[0]).toMatchObject({
      txid: 'txid',
      vout: 1,
      runeTicker: 'AAAAAAAAAAAAAAAADBCSMALNGCU',
      runeId: {
        block: 100000,
        tx: 88,
      },
      amount: 123n,
    });
  });

  test('deploy is successful with terms, premine, multiple edicts to same output', async () => {
    const { runeUpdater } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({
              etching: { premine: 123 },
              edicts: [
                { id: [0, 0], amount: 100, output: 1 },
                { id: [0, 0], amount: 23, output: 1 },
              ],
            }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
      ],
    };

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(1);
    expect(runeUpdater.utxoBalances.length).toBe(1);
    expect(runeUpdater.utxoBalances[0]).toMatchObject({
      txid: 'txid',
      vout: 1,
      runeTicker: 'AAAAAAAAAAAAAAAADBCSMALNGCU',
      runeId: {
        block: 100000,
        tx: 88,
      },
      amount: 123n,
    });
  });

  test('deploy is successful with terms, premine to multiple outputs', async () => {
    const { runeUpdater } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({
              etching: { premine: 123 },
              edicts: [
                { id: [0, 0], amount: 100, output: 1 },
                { id: [0, 0], amount: 23, output: 2 },
              ],
            }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
      ],
    };

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(1);
    expect(runeUpdater.utxoBalances.length).toBe(2);
    expect(runeUpdater.utxoBalances[0]).toMatchObject({
      txid: 'txid',
      vout: 1,
      runeTicker: 'AAAAAAAAAAAAAAAADBCSMALNGCU',
      runeId: {
        block: 100000,
        tx: 88,
      },
      amount: 100n,
    });
    expect(runeUpdater.utxoBalances[1]).toMatchObject({
      txid: 'txid',
      vout: 2,
      runeTicker: 'AAAAAAAAAAAAAAAADBCSMALNGCU',
      runeId: {
        block: 100000,
        tx: 88,
      },
      amount: 23n,
    });
  });
});

describe('mint', () => {
  test('mint is valid with no block height restrictions', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({
              edicts: [{ id: [876543, 21], amount: 100, output: 1 }],
              mint: [876543, 21],
            }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getValidMintCount.mockResolvedValue(0);
    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 100n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(1);
    expect(runeUpdater.utxoBalances[0]).toMatchObject({
      txid: 'txid',
      vout: 1,
      runeTicker: 'TESTRUNE',
      runeId: {
        block: 876543,
        tx: 21,
      },
      amount: 100n,
    });
  });

  test.each([
    ['height', 'start', 100001n, false],
    ['height', 'start', 100000n, true],
    ['offset', 'start', 99113n, false],
    ['offset', 'start', 99112n, true],
    ['height', 'end', 100000n, false],
    ['height', 'end', 100001n, true],
    ['offset', 'end', 99112n, false],
    ['offset', 'end', 99113n, true],
  ])(
    'mint for %s %s with value %d is valid=%s',
    async (heightType, checkType, checkValue, validMint) => {
      const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
      const tx: UpdaterTx = {
        txid: 'txid',
        vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
        vout: [
          {
            scriptPubKey: {
              hex: getDeployRunestoneHex({
                edicts: [{ id: [876543, 21], amount: 100, output: 1 }],
                mint: [876543, 21],
              }),
            },
            value: 0,
          },
          MAGIC_EDEN_OUTPUT,
        ],
      };

      storage.getValidMintCount.mockResolvedValue(0);
      storage.getEtching.mockResolvedValue({
        valid: true,
        txid: 'txid',
        runeTicker: 'TESTRUNE',
        runeName: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        terms: { amount: 100n, cap: 1n, [heightType]: { [checkType]: checkValue } },
      });

      await runeUpdater.indexRunes(tx, 88);
      expect(runeUpdater.etchings.length).toBe(0);
      expect(runeUpdater.utxoBalances.length).toBe(validMint ? 1 : 0);
      if (validMint) {
        expect(runeUpdater.utxoBalances[0]).toMatchObject({
          txid: 'txid',
          vout: 1,
          runeTicker: 'TESTRUNE',
          runeId: {
            block: 876543,
            tx: 21,
          },
          amount: 100n,
        });
      }
    }
  );

  test.each([
    [1, true],
    [3, false],
  ])(
    'mint with 2 cap when existing mint is %s is valid=%s',
    async (existingMintCount, validMint) => {
      const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
      const tx: UpdaterTx = {
        txid: 'txid',
        vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
        vout: [
          {
            scriptPubKey: {
              hex: getDeployRunestoneHex({
                edicts: [{ id: [876543, 21], amount: 100, output: 1 }],
                mint: [876543, 21],
              }),
            },
            value: 0,
          },
          MAGIC_EDEN_OUTPUT,
        ],
      };

      storage.getValidMintCount.mockResolvedValue(existingMintCount);
      storage.getEtching.mockResolvedValue({
        valid: true,
        txid: 'txid',
        runeTicker: 'TESTRUNE',
        runeName: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        terms: { amount: 100n, cap: 3n },
      });

      await runeUpdater.indexRunes(tx, 88);
      expect(runeUpdater.etchings.length).toBe(0);
      expect(runeUpdater.utxoBalances.length).toBe(validMint ? 1 : 0);
      if (validMint) {
        expect(runeUpdater.utxoBalances[0]).toMatchObject({
          txid: 'txid',
          vout: 1,
          runeTicker: 'TESTRUNE',
          runeId: {
            block: 876543,
            tx: 21,
          },
          amount: 100n,
        });
      }
    }
  );

  test.each([
    [75, 75n],
    [100, 100n],
    [120, 100n],
  ])(
    'mint is valid with %s requested mint resulting in %s actual amount',
    async (requestedAmount, actualAmount) => {
      const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
      const tx: UpdaterTx = {
        txid: 'txid',
        vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
        vout: [
          {
            scriptPubKey: {
              hex: getDeployRunestoneHex({
                edicts: [{ id: [876543, 21], amount: requestedAmount, output: 1 }],
                mint: [876543, 21],
                pointer: 0,
              }),
            },
            value: 0,
          },
          MAGIC_EDEN_OUTPUT,
        ],
      };

      storage.getValidMintCount.mockResolvedValue(0);
      storage.getEtching.mockResolvedValue({
        valid: true,
        txid: 'txid',
        runeTicker: 'TESTRUNE',
        runeName: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        terms: { amount: 100n, cap: 1n },
      });

      await runeUpdater.indexRunes(tx, 88);
      expect(runeUpdater.etchings.length).toBe(0);
      expect(runeUpdater.utxoBalances.length).toBe(1);
      expect(runeUpdater.utxoBalances[0]).toMatchObject({
        txid: 'txid',
        vout: 1,
        runeTicker: 'TESTRUNE',
        runeId: {
          block: 876543,
          tx: 21,
        },
        amount: actualAmount,
      });
    }
  );

  test('mint is valid with amount with multiple outputs', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({
              edicts: [
                { id: [876543, 21], amount: 42, output: 1 },
                { id: [876543, 21], amount: 58, output: 2 },
              ],
              mint: [876543, 21],
            }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getValidMintCount.mockResolvedValue(0);
    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 100n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(2);
    expect(runeUpdater.utxoBalances[0]).toMatchObject({
      txid: 'txid',
      vout: 1,
      runeTicker: 'TESTRUNE',
      runeId: {
        block: 876543,
        tx: 21,
      },
      amount: 42n,
    });
    expect(runeUpdater.utxoBalances[1]).toMatchObject({
      txid: 'txid',
      vout: 2,
      runeTicker: 'TESTRUNE',
      runeId: {
        block: 876543,
        tx: 21,
      },
      amount: 58n,
    });
  });
});

test('mint is valid for etching in same block', async () => {
  const { runeUpdater, storage } = getDefaultRuneUpdaterContext();

  storage.getValidMintCount.mockResolvedValue(0);

  const tx1: UpdaterTx = {
    txid: 'txid1',
    vin: [{ txid: 'parenttxid', vout: 1, txinwitness: [] }],
    vout: [
      {
        scriptPubKey: {
          hex: getDeployRunestoneHex({
            etching: { terms: { amount: 100, cap: 1 } },
          }),
        },
        value: 0,
      },
      MAGIC_EDEN_OUTPUT,
    ],
  };
  await runeUpdater.indexRunes(tx1, 21);

  const tx2: UpdaterTx = {
    txid: 'txid2',
    vin: [{ txid: 'parenttxid', vout: 2, txinwitness: [] }],
    vout: [
      {
        scriptPubKey: {
          hex: getDeployRunestoneHex({
            edicts: [{ id: [100000, 21], amount: 100, output: 1 }],
            mint: [100000, 21],
          }),
        },
        value: 0,
      },
      MAGIC_EDEN_OUTPUT,
    ],
  };

  await runeUpdater.indexRunes(tx2, 88);

  expect(runeUpdater.etchings.length).toBe(1);
  expect(runeUpdater.utxoBalances.length).toBe(1);
  expect(runeUpdater.utxoBalances[0]).toMatchObject({
    txid: 'txid2',
    vout: 1,
    runeTicker: 'AAAAAAAAAAAAAAAADBCSMALNGAF',
    runeId: {
      block: 100000,
      tx: 21,
    },
    amount: 100n,
  });
});

describe('edict', () => {
  test('edicts successfully moves runes', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [
        { txid: 'parenttxid', vout: 0, txinwitness: [] },
        { txid: 'parenttxid', vout: 1, txinwitness: [] },
      ],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({
              edicts: [
                { id: [888, 8], amount: 420, output: 1 },
                { id: [888, 8], amount: 69, output: 2 },
              ],
            }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getUtxoBalance.mockResolvedValueOnce([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 400n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);
    storage.getUtxoBalance.mockResolvedValueOnce([
      {
        txid: 'parenttxid',
        vout: 1,
        amount: 89n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);
    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 500n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(2);
    expect(runeUpdater.utxoBalances[0]).toMatchObject({
      txid: 'txid',
      vout: 1,
      runeTicker: 'TESTRUNE',
      runeId: {
        block: 888,
        tx: 8,
      },
      amount: 420n,
    });
    expect(runeUpdater.utxoBalances[1]).toMatchObject({
      txid: 'txid',
      vout: 2,
      runeTicker: 'TESTRUNE',
      runeId: {
        block: 888,
        tx: 8,
      },
      amount: 69n,
    });
  });

  test('edicts chained successfully moves runes', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx1: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 0, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({}),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
      ],
    };
    const tx2: UpdaterTx = {
      txid: 'childtxid',
      vin: [{ txid: 'txid', vout: 1, txinwitness: [] }],
      vout: [MAGIC_EDEN_OUTPUT],
    };

    storage.getUtxoBalance.mockResolvedValueOnce([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 400n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);

    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 500n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx1, 88);
    await runeUpdater.indexRunes(tx2, 89);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(2);
    expect(runeUpdater.spentBalances.length).toBe(2);
    expect(runeUpdater.utxoBalances[0]).toMatchObject({
      txid: 'txid',
      vout: 1,
      runeTicker: 'TESTRUNE',
      runeId: {
        block: 888,
        tx: 8,
      },
      amount: 400n,
    });
    expect(runeUpdater.utxoBalances[1]).toMatchObject({
      txid: 'childtxid',
      vout: 0,
      runeTicker: 'TESTRUNE',
      runeId: {
        block: 888,
        tx: 8,
      },
      amount: 400n,
    });
    expect(runeUpdater.spentBalances[0]).toMatchObject({
      txid: 'parenttxid',
      vout: 0,
      address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
      scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
      runeId: {
        block: 888,
        tx: 8,
      },
      runeTicker: 'TESTRUNE',
      amount: 400n,
      spentTxid: 'txid',
    });
    expect(runeUpdater.spentBalances[1]).toMatchObject({
      txid: 'txid',
      vout: 1,
      address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
      runeId: {
        block: 888,
        tx: 8,
      },
      runeTicker: 'TESTRUNE',
      amount: 400n,
      spentTxid: 'childtxid',
    });
  });

  test('edict with invalid output is cenotaph', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 0, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({ edicts: [{ id: [888, 8], amount: 400, output: 4 }] }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getUtxoBalance.mockResolvedValueOnce([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 400n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);

    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 400n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(0);
    expect(runeUpdater.burnedBalances).toEqual([
      {
        runeId: { block: 888, tx: 8 },
        amount: 400n,
      },
    ]);
  });

  test('edict with not all amount goes to native default', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 0, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({}),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getUtxoBalance.mockResolvedValueOnce([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 400n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);

    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 400n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(1);
    expect(runeUpdater.utxoBalances[0]).toMatchObject({
      txid: 'txid',
      vout: 1,
      runeTicker: 'TESTRUNE',
      runeId: {
        block: 888,
        tx: 8,
      },
      amount: 400n,
    });
  });

  test('edict with not all amount goes to runestone default', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 0, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({ pointer: 2 }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getUtxoBalance.mockResolvedValueOnce([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 400n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);

    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 400n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(1);
    expect(runeUpdater.utxoBalances[0]).toMatchObject({
      txid: 'txid',
      vout: 2,
      runeTicker: 'TESTRUNE',
      runeId: {
        block: 888,
        tx: 8,
      },
      amount: 400n,
    });
  });

  test('edict with all outputs with 0 amount', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 0, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({
              edicts: [{ id: [888, 8], amount: 0, output: 5 }],
            }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getUtxoBalance.mockResolvedValue([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 400n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);

    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 400n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(4);
    for (const i of _.range(4)) {
      expect(runeUpdater.utxoBalances[i]).toMatchObject({
        txid: 'txid',
        vout: i + 1,
        runeTicker: 'TESTRUNE',
        runeId: {
          block: 888,
          tx: 8,
        },
        amount: 100n,
      });
    }
  });

  test('edict with all outputs with 0 amount on not well divisible amount', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 0, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({
              edicts: [{ id: [888, 8], amount: 0, output: 5 }],
            }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getUtxoBalance.mockResolvedValue([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 402n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);

    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 402n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(4);
    for (const i of _.range(4)) {
      expect(runeUpdater.utxoBalances[i]).toMatchObject({
        txid: 'txid',
        vout: i + 1,
        runeTicker: 'TESTRUNE',
        runeId: {
          block: 888,
          tx: 8,
        },
        amount: [101n, 101n, 100n, 100n][i],
      });
    }
  });

  test('edict with all outputs with 0 amount after a specified amount beforehand', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 0, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({
              edicts: [
                { id: [888, 8], amount: 100, output: 1 },
                { id: [888, 8], amount: 0, output: 5 },
              ],
            }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getUtxoBalance.mockResolvedValue([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 500n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);

    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 500n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(4);
    for (const i of _.range(4)) {
      expect(runeUpdater.utxoBalances[i]).toMatchObject({
        txid: 'txid',
        vout: i + 1,
        runeTicker: 'TESTRUNE',
        runeId: {
          block: 888,
          tx: 8,
        },
        amount: i === 0 ? 200n : 100n,
      });
    }
  });

  test('edict with all outputs with specified amount', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 0, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({
              edicts: [{ id: [888, 8], amount: 50, output: 5 }],
            }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getUtxoBalance.mockResolvedValue([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 400n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);

    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 400n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(4);
    for (const i of _.range(4)) {
      expect(runeUpdater.utxoBalances[i]).toMatchObject({
        txid: 'txid',
        vout: i + 1,
        runeTicker: 'TESTRUNE',
        runeId: {
          block: 888,
          tx: 8,
        },
        amount: i === 0 ? 250n : 50n,
      });
    }
  });

  test('edict with all outputs with specified amount not enough', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 0, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({
              edicts: [{ id: [888, 8], amount: 140, output: 5 }],
            }),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getUtxoBalance.mockResolvedValue([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 400n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);

    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 400n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(3);
    for (const i of _.range(3)) {
      expect(runeUpdater.utxoBalances[i]).toMatchObject({
        txid: 'txid',
        vout: i + 1,
        runeTicker: 'TESTRUNE',
        runeId: {
          block: 888,
          tx: 8,
        },
        amount: [140n, 140n, 120n][i],
      });
    }
  });
});

describe('no runestone', () => {
  test('all runes get transferred to first output if not op return', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 0, txinwitness: [] }],
      vout: [
        MAGIC_EDEN_OUTPUT,
        {
          scriptPubKey: {
            hex: Buffer.from([OP_RETURN]).toString('hex'),
          },
          value: 0,
        },
      ],
    };

    storage.getUtxoBalance.mockResolvedValueOnce([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 400n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);
    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 400n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(1);
    expect(runeUpdater.utxoBalances[0]).toMatchObject({
      txid: 'txid',
      vout: 0,
      runeTicker: 'TESTRUNE',
      runeId: {
        block: 888,
        tx: 8,
      },
      amount: 400n,
    });
  });

  test('all runes get transferred to first non op-return output', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 0, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: Buffer.from([OP_RETURN]).toString('hex'),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getUtxoBalance.mockResolvedValueOnce([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 400n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);
    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 400n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(1);
    expect(runeUpdater.utxoBalances[0]).toMatchObject({
      txid: 'txid',
      vout: 1,
      runeTicker: 'TESTRUNE',
      runeId: {
        block: 888,
        tx: 8,
      },
      amount: 400n,
    });
  });
});

describe('burning', () => {
  test('edict to op return is burn', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 0, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: {
            hex: getDeployRunestoneHex({ edicts: [{ id: [888, 8], amount: 400, output: 1 }] }),
          },
          value: 0,
        },
        {
          scriptPubKey: {
            hex: Buffer.from([OP_RETURN]).toString('hex'),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getUtxoBalance.mockResolvedValueOnce([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 400n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);
    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 400n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(0);
    expect(runeUpdater.burnedBalances).toEqual([
      {
        runeId: {
          block: 888,
          tx: 8,
        },
        amount: 400n,
      },
    ]);
  });

  test('pointer to op return is burn', async () => {
    const { runeUpdater, storage } = getDefaultRuneUpdaterContext();
    const tx: UpdaterTx = {
      txid: 'txid',
      vin: [{ txid: 'parenttxid', vout: 0, txinwitness: [] }],
      vout: [
        {
          scriptPubKey: { hex: getDeployRunestoneHex({ pointer: 1 }) },
          value: 0,
        },
        {
          scriptPubKey: {
            hex: Buffer.from([OP_RETURN]).toString('hex'),
          },
          value: 0,
        },
        MAGIC_EDEN_OUTPUT,
      ],
    };

    storage.getUtxoBalance.mockResolvedValueOnce([
      {
        txid: 'parenttxid',
        vout: 0,
        amount: 400n,
        runeTicker: 'TESTRUNE',
        runeId: { block: 888, tx: 8 },
        scriptPubKey: Buffer.from('a914ea6b832a05c6ca578baa3836f3f25553d41068a587', 'hex'),
        address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
        satValue: 0,
      },
    ]);
    storage.getEtching.mockResolvedValue({
      valid: true,
      txid: 'txid',
      runeTicker: 'TESTRUNE',
      runeName: 'TESTRUNE',
      runeId: { block: 888, tx: 8 },
      terms: { amount: 400n, cap: 1n },
    });

    await runeUpdater.indexRunes(tx, 88);
    expect(runeUpdater.etchings.length).toBe(0);
    expect(runeUpdater.utxoBalances.length).toBe(0);
    expect(runeUpdater.burnedBalances).toEqual([
      {
        runeId: {
          block: 888,
          tx: 8,
        },
        amount: 400n,
      },
    ]);
  });
});
