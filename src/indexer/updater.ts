import assert from 'node:assert/strict';
import { Artifact, isRunestone } from '../artifact';
import { COMMIT_INTERVAL, OP_RETURN, TAPROOT_ANNEX_PREFIX } from '../constants';
import { u128, u32, u64, u8 } from '../integer';
import { None, Option, Some } from '../monads';
import { Network } from '../network';
import { BitcoinRpcClient, Tx } from '../rpcclient';
import { Rune } from '../rune';
import { Runestone } from '../runestone';
import { script } from '../script';
import {
  BlockInfo,
  RuneBlockIndex,
  RuneEtching,
  RuneLocation,
  RuneUtxoBalance,
  RunestoneStorage,
} from './types';

function isScriptPubKeyHexOpReturn(scriptPubKeyHex: string) {
  return scriptPubKeyHex && Buffer.from(scriptPubKeyHex, 'hex')[0] === OP_RETURN;
}

export class RuneUpdater implements RuneBlockIndex {
  block: BlockInfo;
  etchings: RuneEtching[] = [];
  mintCounts: Map<string, number> = new Map();
  utxoBalances: RuneUtxoBalance[] = [];
  burnedBalances: Map<string, bigint> = new Map();

  _minimum: Rune;

  constructor(
    network: Network,
    block: BlockInfo,
    private readonly _storage: RunestoneStorage,
    private readonly _rpc: BitcoinRpcClient
  ) {
    this.block = { height: block.height, hash: block.hash };
    this._minimum = Rune.getMinimumAtHeight(network, u128(block.height));
  }

  async indexRunes(tx: Tx, txIndex: number): Promise<void> {
    const optionArtifact = Runestone.decipher(tx);
    const unallocated = await this.unallocated(tx);
    const allocated: Map<string, u128>[] = new Array(tx.vout.length).map(() => new Map());

    if (optionArtifact.isSome()) {
      const artifact = optionArtifact.unwrap();
      const optionMint = artifact.mint;
      if (optionMint.isSome()) {
        const runeId = optionMint.unwrap();
        const runeLocation = {
          block: Number(runeId.block),
          tx: Number(runeId.tx),
        };
        const runeLocationString = RuneLocation.toString(runeLocation);
        const optionAmount = await this.mint(runeLocation, tx.txid);
        if (optionAmount.isSome()) {
          const amount = optionAmount.unwrap();
          const currentUnallocatedAmount = unallocated.get(runeLocationString) ?? u128(0);
          unallocated.set(
            runeLocationString,
            u128.checkedAddThrow(currentUnallocatedAmount, u128(amount))
          );
        }
      }

      const optionEtched = await this.etched(txIndex, tx, artifact);

      if (isRunestone(artifact)) {
        const runestone = artifact;

        if (optionEtched.isSome()) {
          const etched = optionEtched.unwrap();
          const runeLocation = RuneLocation.toString(etched.runeId);
          const currentUnallocated = unallocated.get(runeLocation) ?? u128(0);
          unallocated.set(
            runeLocation,
            u128
              .checkedAdd(currentUnallocated, runestone.etching.unwrap().premine.unwrapOr(u128(0)))
              .unwrap()
          );
        }

        for (const { id, amount, output } of [...runestone.edicts]) {
          // edicts with output values greater than the number of outputs
          // should never be produced by the edict parser
          if (output > tx.vout.length) {
            throw new Error('Runestone edict output should never exceed transaction output size');
          }

          if (id.block === 0n && id.tx === 0n && optionEtched.isNone()) {
            continue;
          }

          const runeLocation =
            id.block === 0n && id.tx === 0n
              ? optionEtched.unwrap().runeId
              : { block: Number(id.block), tx: Number(id.tx) };

          const runeLocationString = RuneLocation.toString(runeLocation);
          const maybeBalance = unallocated.get(runeLocationString);
          if (maybeBalance === undefined) {
            continue;
          }

          let balance = maybeBalance;
          let allocate = (amount: u128, output: number) => {
            if (amount > 0n) {
              const currentAllocated = allocated[output].get(runeLocationString) ?? u128(0);
              balance = u128.checkedSubThrow(balance, amount);
              allocated[output].set(
                runeLocationString,
                u128.checkedAddThrow(currentAllocated, amount)
              );
            }
          };

          if (Number(output) === tx.vout.length) {
            // find non-OP_RETURN outputs
            const destinations = [...tx.vout.entries()]
              .filter(([_, vout]) => isScriptPubKeyHexOpReturn(vout.scriptPubKey.hex))
              .map(([index]) => index);

            if (amount === 0n) {
              // if amount is zero, divide balance between eligible outputs
              const amount = u128(balance / u128(destinations.length));
              const remainder = balance % u128(destinations.length);

              for (const [i, output] of destinations.entries()) {
                allocate(i < remainder ? u128.checkedAddThrow(amount, u128(1)) : amount, output);
              }
            } else {
              // if amount is non-zero, distribute amount to eligible outputs
              for (const output of destinations) {
                allocate(amount < balance ? amount : balance, output);
              }
            }
          } else {
            // Get the allocatable amount
            allocate(amount !== 0n && amount < balance ? amount : balance, Number(output));
          }
        }
      }

      if (optionEtched.isSome()) {
        const { runeId, rune } = optionEtched.unwrap();
        this.createEtching(tx.txid, artifact, runeId, rune);
      }
    }

    const burned: Map<string, u128> = new Map();

    if (optionArtifact.isSome() && !isRunestone(optionArtifact.unwrap())) {
      for (const [id, balance] of unallocated.entries()) {
        const currentBalance = burned.get(id) ?? u128(0);
        burned.set(id, u128.checkedAddThrow(currentBalance, balance));
      }
    } else {
      const pointer = optionArtifact
        .map((artifact) => {
          if (!isRunestone(artifact)) {
            throw new Error('unreachable');
          }

          return artifact.pointer;
        })
        .unwrapOr(None);

      const optionVout = pointer
        .map((pointer) => Number(pointer))
        .inspect((pointer) => assert(pointer < allocated.length))
        .orElse(() => {
          const entry = [...tx.vout.entries()].find(([_, txOut]) =>
            isScriptPubKeyHexOpReturn(txOut.scriptPubKey.hex)
          );
          return entry !== undefined ? Some(entry[0]) : None;
        });
      if (optionVout.isSome()) {
        const vout = optionVout.unwrap();
        for (const [id, balance] of unallocated) {
          if (balance > 0) {
            const currentBalance = allocated[vout].get(id) ?? u128(0);
            allocated[vout].set(id, u128.checkedAddThrow(currentBalance, balance));
          }
        }
      } else {
        for (const [id, balance] of unallocated) {
          if (balance > 0) {
            const currentBalance = burned.get(id) ?? u128(0);
            burned.set(id, u128.checkedAddThrow(currentBalance, balance));
          }
        }
      }
    }

    // update outpoint balances
    for (const [vout, balances] of allocated.entries()) {
      if (balances.size === 0) {
        continue;
      }

      // increment burned balances
      const output = tx.vout[vout];
      if (isScriptPubKeyHexOpReturn(output.scriptPubKey.hex)) {
        for (const [id, balance] of balances) {
          const currentBurned = burned.get(id) ?? u128(0);
          burned.set(id, u128.checkedAddThrow(currentBurned, balance));
        }
        continue;
      }

      for (const [rune, balance] of balances) {
        this.utxoBalances.push({
          runeId: { block: this.block.height, tx: txIndex },
          rune,
          amount: balance,
          scriptPubKey: Buffer.from(output.scriptPubKey.hex),
          txid: tx.txid,
          vout,
          address: output.scriptPubKey.address,
        });
      }
    }

    // increment entries with burned runes
    for (const [id, amount] of burned) {
      const currentBurned = u128(this.burnedBalances.get(id) ?? 0n);
      this.burnedBalances.set(id, u128.checkedAddThrow(currentBurned, amount));
    }

    return;
  }

  async etched(
    txIndex: number,
    tx: Tx,
    artifact: Artifact
  ): Promise<Option<{ runeId: RuneLocation; rune: Rune }>> {
    const optionRune = artifact.rune;
    if (optionRune.isNone()) {
      return None;
    }

    let rune: Rune;
    if (optionRune.isSome()) {
      rune = optionRune.unwrap();

      if (
        rune.value < this._minimum.value ||
        rune.reserved ||
        (await this._storage.getRuneLocation(rune.toString())) !== null ||
        !(await this.txCommitsToRune(tx, rune))
      ) {
        return None;
      }
    } else {
      rune = Rune.getReserved(u64(this.block.height), u32(txIndex));
    }

    return Some({
      runeId: {
        block: this.block.height,
        tx: txIndex,
      },
      rune,
    });
  }

  private async mint(id: RuneLocation, txid: string): Promise<Option<bigint>> {
    const runeLocation = RuneLocation.toString(id);
    const etching = await this._storage.getEtching(runeLocation);
    if (etching === null || !etching.valid || !etching.terms) {
      return None;
    }

    const terms = etching.terms;

    const startRelative =
      terms.offset?.start !== undefined ? this.block.height + Number(terms.offset.start) : null;
    const startAbsolute = terms.height?.start !== undefined ? Number(terms.height.start) : null;
    const start =
      startRelative !== null || startAbsolute !== null
        ? Math.max(startRelative ?? -Infinity, startAbsolute ?? -Infinity)
        : null;
    if (start !== null && this.block.height < start) {
      return None;
    }

    const endRelative =
      terms.offset?.end !== undefined ? this.block.height + Number(terms.offset.end) : null;
    const endAbsolute = terms.height?.end !== undefined ? Number(terms.height.end) : null;
    const end =
      endRelative !== null || endAbsolute !== null
        ? Math.max(endRelative ?? -Infinity, endAbsolute ?? -Infinity)
        : null;
    if (end !== null && this.block.height >= end) {
      return None;
    }

    const cap = terms.cap ?? 0n;

    const currentBlockMints = this.mintCounts.get(runeLocation) ?? 0;
    const totalMints = currentBlockMints + (await this._storage.getValidMintCount(runeLocation));

    if (totalMints >= cap) {
      return None;
    }

    const amount = terms.amount ?? 0n;

    this.mintCounts.set(runeLocation, currentBlockMints + 1);

    return Some(amount);
  }

  private async unallocated(tx: Tx) {
    const unallocated = new Map<string, u128>();

    for (const input of tx.vin) {
      if ('coinbase' in input) {
        continue;
      }

      const utxoBalance = await this._storage.getUtxoBalance(input.txid, input.vout);
      for (const additionalBalance of utxoBalance) {
        const runeLocation = RuneLocation.toString(additionalBalance.runeId);
        const existingBalance = unallocated.get(runeLocation) ?? u128(0);
        const newBalance = u128.checkedAddThrow(existingBalance, u128(additionalBalance.amount));
        unallocated.set(runeLocation, newBalance);
      }
    }

    return unallocated;
  }

  async txCommitsToRune(tx: Tx, rune: Rune): Promise<boolean> {
    const commitment = rune.commitment;
    for (const input of tx.vin) {
      if ('coinbase' in input) {
        continue;
      }

      const witnessStack = input.txinwitness.map((item) => Buffer.from(item, 'hex'));
      const lastWitnessElement = witnessStack[witnessStack.length - 1];
      const offset =
        witnessStack.length >= 2 && lastWitnessElement[0] === TAPROOT_ANNEX_PREFIX ? 3 : 2;
      if (offset > witnessStack.length) {
        continue;
      }

      const inscructions = script.decompile(witnessStack[lastWitnessElement.length - offset]);
      for (const instruction of inscructions) {
        if (!Buffer.isBuffer(instruction)) {
          continue;
        }

        if (Buffer.compare(instruction, commitment) !== 0) {
          continue;
        }

        // rpc client
        const inputTxResult = await this._rpc.getrawtransaction({
          txid: input.txid,
          verbose: true,
        });
        if (inputTxResult.error !== null) {
          throw inputTxResult.error;
        }
        const inputTx = inputTxResult.result;

        const isTaproot = inputTx.vout[input.vout].scriptPubKey.type === 'witness_v1_taproot';
        const mature = (inputTx.confirmations ?? -Infinity) >= COMMIT_INTERVAL;

        if (isTaproot && mature) {
          return true;
        }
      }
    }

    return false;
  }

  createEtching(txid: string, artifact: Artifact, runeId: RuneLocation, rune: Rune) {
    if (isRunestone(artifact)) {
      const { divisibility, terms, premine, spacers, symbol } = artifact.etching.unwrap();
      this.etchings.push({
        valid: true,
        rune: rune.toString(),
        runeId,
        txid,
        ...(divisibility.isSome() ? { divisibility: divisibility.map(Number).unwrap() } : {}),
        ...(premine.isSome() ? { premine: premine.unwrap() } : {}),
        ...(symbol.isSome() ? { symbol: symbol.unwrap() } : {}),
        ...(spacers.isSome()
          ? {
              spacers: (() => {
                const spacersNumber = Number(spacers.unwrap());
                const spacersArray: number[] = [];
                for (const [i] of new Array(32).entries()) {
                  if ((spacersNumber & (1 << i)) !== 0) {
                    spacersArray.push(i);
                  }
                }
                return spacersArray;
              })(),
            }
          : {}),
        ...(terms.isSome()
          ? {
              terms: (() => {
                const unwrappedTerms = terms.unwrap();

                return {
                  ...(unwrappedTerms.amount.isSome()
                    ? { amount: unwrappedTerms.amount.unwrap() }
                    : {}),
                  ...(unwrappedTerms.cap.isSome() ? { cap: unwrappedTerms.cap.unwrap() } : {}),
                  ...(unwrappedTerms.height.filter((option) => option.isSome()).length
                    ? {
                        height: {
                          ...(unwrappedTerms.height[0].isSome()
                            ? { start: unwrappedTerms.height[0].unwrap() }
                            : {}),
                          ...(unwrappedTerms.height[1].isSome()
                            ? { start: unwrappedTerms.height[1].unwrap() }
                            : {}),
                        },
                      }
                    : {}),
                  ...(unwrappedTerms.offset.filter((option) => option.isSome()).length
                    ? {
                        offset: {
                          ...(unwrappedTerms.offset[0].isSome()
                            ? { start: unwrappedTerms.offset[0].unwrap() }
                            : {}),
                          ...(unwrappedTerms.offset[1].isSome()
                            ? { start: unwrappedTerms.offset[1].unwrap() }
                            : {}),
                        },
                      }
                    : {}),
                };
              })(),
            }
          : {}),
      });
    } else {
      // save failed entry
      this.etchings.push({
        valid: false,
        runeId,
        txid,
        rune: rune.toString(),
      });
    }
  }
}
