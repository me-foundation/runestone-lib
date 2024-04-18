import { Artifact, isRunestone } from '../artifact';
import {
  COMMIT_CONFIRMATIONS,
  OP_RETURN,
  TAPROOT_ANNEX_PREFIX,
  TAPROOT_SCRIPT_PUBKEY_TYPE,
} from '../constants';
import { u128, u32, u64 } from '../integer';
import { None, Option, Some } from '../monads';
import { Network } from '../network';
import { BitcoinRpcClient } from '../rpcclient';
import { Rune } from '../rune';
import { Runestone } from '../runestone';
import { script } from '../script';
import {
  BlockInfo,
  RuneBlockIndex,
  RuneBalance,
  RuneEtching,
  RuneLocation,
  RuneMintCount,
  RuneOutput,
  RuneUtxoBalance,
  RunestoneStorage,
} from './types';
import { SpacedRune } from '../spacedrune';

function isScriptPubKeyHexOpReturn(scriptPubKeyHex: string) {
  return scriptPubKeyHex && Buffer.from(scriptPubKeyHex, 'hex')[0] === OP_RETURN;
}

export type UpdaterTx = {
  txid: string;
  vin: ({ txid: string; vout: number; txinwitness: string[] } | { coinbase: string })[];
  vout: { scriptPubKey: { hex: string; address?: string } }[];
};

export class RuneUpdater implements RuneBlockIndex {
  block: BlockInfo;
  etchings: RuneEtching[] = [];
  utxoBalances: RuneUtxoBalance[] = [];
  spentOutputs: RuneOutput[] = [];

  private _minimum: Rune;
  private _mintCountsByRuneLocation: Map<string, RuneMintCount> = new Map();
  private _burnedBalancesByRuneLocation: Map<string, RuneBalance> = new Map();

  constructor(
    network: Network,
    block: BlockInfo,
    readonly reorg: boolean,
    private readonly _storage: RunestoneStorage,
    private readonly _rpc: BitcoinRpcClient
  ) {
    this.block = {
      height: block.height,
      hash: block.hash,
      previousblockhash: block.previousblockhash,
      time: block.time,
    };
    this._minimum = Rune.getMinimumAtHeight(network, u128(block.height));
  }

  get mintCounts(): RuneMintCount[] {
    return [...this._mintCountsByRuneLocation.values()];
  }

  get burnedBalances(): RuneBalance[] {
    return [...this._burnedBalancesByRuneLocation.values()];
  }

  async indexRunes(tx: UpdaterTx, txIndex: number): Promise<void> {
    const optionArtifact = Runestone.decipher(tx);
    const unallocated = await this.unallocated(tx);
    const allocated: Map<string, RuneBalance>[] = [...new Array(tx.vout.length)].map(
      () => new Map()
    );

    function getUnallocatedRuneBalance(runeId: RuneLocation) {
      const key = RuneLocation.toString(runeId);
      const balance = unallocated.get(key) ?? { runeId, amount: 0n };
      unallocated.set(key, balance);
      return balance;
    }

    function getAllocatedRuneBalance(vout: number, runeId: RuneLocation) {
      const key = RuneLocation.toString(runeId);
      const balance = allocated[vout].get(key) ?? { runeId, amount: 0n };
      allocated[vout].set(key, balance);
      return balance;
    }

    if (optionArtifact.isSome()) {
      const artifact = optionArtifact.unwrap();
      const optionMint = artifact.mint;
      if (optionMint.isSome()) {
        const runeId = optionMint.unwrap();
        const runeLocation = {
          block: Number(runeId.block),
          tx: Number(runeId.tx),
        };
        const optionAmount = await this.mint(runeLocation, tx.txid);
        if (optionAmount.isSome()) {
          const amount = optionAmount.unwrap();
          const unallocatedBalance = getUnallocatedRuneBalance(runeLocation);
          unallocatedBalance.amount = u128.checkedAddThrow(
            u128(unallocatedBalance.amount),
            u128(amount)
          );
        }
      }

      const optionEtched = await this.etched(txIndex, tx, artifact);

      if (isRunestone(artifact)) {
        const runestone = artifact;

        if (optionEtched.isSome()) {
          const etched = optionEtched.unwrap();
          const unallocatedBalance = getUnallocatedRuneBalance(etched.runeId);
          unallocatedBalance.amount = u128.checkedAddThrow(
            u128(unallocatedBalance.amount),
            runestone.etching.unwrap().premine.unwrapOr(u128(0))
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

          let allocate = (amount: u128, output: number) => {
            if (amount > 0n) {
              const currentAllocated = getAllocatedRuneBalance(output, runeLocation);
              maybeBalance.amount = u128.checkedSubThrow(u128(maybeBalance.amount), amount);
              currentAllocated.amount = u128.checkedAddThrow(u128(currentAllocated.amount), amount);
            }
          };

          if (Number(output) === tx.vout.length) {
            // find non-OP_RETURN outputs
            const destinations = [...tx.vout.entries()]
              .filter(([_, vout]) => !isScriptPubKeyHexOpReturn(vout.scriptPubKey.hex))
              .map(([index]) => index);

            if (amount === 0n) {
              // if amount is zero, divide balance between eligible outputs
              const amount = u128(u128(maybeBalance.amount) / u128(destinations.length));
              const remainder = u128(maybeBalance.amount) % u128(destinations.length);

              for (const [i, output] of destinations.entries()) {
                allocate(i < remainder ? u128.checkedAddThrow(amount, u128(1)) : amount, output);
              }
            } else {
              // if amount is non-zero, distribute amount to eligible outputs
              for (const output of destinations) {
                allocate(amount < maybeBalance.amount ? amount : u128(maybeBalance.amount), output);
              }
            }
          } else {
            // Get the allocatable amount
            allocate(
              amount !== 0n && amount < u128(maybeBalance.amount)
                ? amount
                : u128(maybeBalance.amount),
              Number(output)
            );
          }
        }
      }

      if (optionEtched.isSome()) {
        const { runeId, rune } = optionEtched.unwrap();
        this.createEtching(tx.txid, artifact, runeId, rune);
      }
    }

    const burned: Map<string, RuneBalance> = new Map();

    function getBurnedRuneBalance(runeId: RuneLocation) {
      const key = RuneLocation.toString(runeId);
      const balance = burned.get(key) ?? { runeId, amount: 0n };
      burned.set(key, balance);
      return balance;
    }

    if (optionArtifact.isSome() && !isRunestone(optionArtifact.unwrap())) {
      for (const balance of unallocated.values()) {
        const currentBalance = getBurnedRuneBalance(balance.runeId);
        currentBalance.amount = u128.checkedAddThrow(
          u128(currentBalance.amount),
          u128(balance.amount)
        );
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
        .inspect((pointer) => {
          if (pointer < 0 || pointer >= allocated.length) throw new Error('Pointer is invalid');
        })
        .orElse(() => {
          const entry = [...tx.vout.entries()].find(
            ([_, txOut]) => !isScriptPubKeyHexOpReturn(txOut.scriptPubKey.hex)
          );
          return entry !== undefined ? Some(entry[0]) : None;
        });
      if (optionVout.isSome()) {
        const vout = optionVout.unwrap();
        for (const balance of unallocated.values()) {
          if (balance.amount > 0) {
            const currentBalance = getAllocatedRuneBalance(vout, balance.runeId);
            currentBalance.amount = u128.checkedAddThrow(
              u128(currentBalance.amount),
              u128(balance.amount)
            );
          }
        }
      } else {
        for (const [id, balance] of unallocated) {
          if (balance.amount > 0) {
            const currentBalance = getBurnedRuneBalance(balance.runeId);
            burned.set(id, {
              runeId: balance.runeId,
              amount: u128.checkedAddThrow(u128(currentBalance.amount), u128(balance.amount)),
            });
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
          const currentBurned = getBurnedRuneBalance(balance.runeId);
          currentBurned.amount = u128.checkedAddThrow(
            u128(currentBurned.amount),
            u128(balance.amount)
          );
        }
        continue;
      }

      const etchingByRuneId = new Map(
        this.etchings.map((etching) => [RuneLocation.toString(etching.runeId), etching])
      );
      for (const balance of balances.values()) {
        const runeIdString = RuneLocation.toString(balance.runeId);
        const etching =
          etchingByRuneId.get(runeIdString) ??
          (await this._storage.getEtching(runeIdString, this.block.height - 1));
        if (etching === null) {
          throw new Error('Rune should exist at this point');
        }

        this.utxoBalances.push({
          runeId: balance.runeId,
          runeTicker: etching.runeTicker,
          amount: balance.amount,
          scriptPubKey: Buffer.from(output.scriptPubKey.hex),
          txid: tx.txid,
          vout,
          address: output.scriptPubKey.address,
        });
      }
    }

    // update entries with burned runes
    for (const [id, balance] of burned) {
      this._burnedBalancesByRuneLocation.set(id, balance);
    }

    return;
  }

  async etched(
    txIndex: number,
    tx: UpdaterTx,
    artifact: Artifact
  ): Promise<Option<{ runeId: RuneLocation; rune: Rune }>> {
    let optionRune: Option<Rune>;
    if (isRunestone(artifact)) {
      const runestone = artifact;
      if (runestone.etching.isNone()) {
        return None;
      }
      optionRune = runestone.etching.unwrap().rune;
    } else {
      const cenotaph = artifact;
      if (cenotaph.etching.isNone()) {
        return None;
      }
      optionRune = cenotaph.etching;
    }

    let rune: Rune;
    if (optionRune.isSome()) {
      rune = optionRune.unwrap();

      if (
        rune.value < this._minimum.value ||
        rune.reserved ||
        this.etchings.find(
          (etching) => SpacedRune.fromString(etching.runeName).rune.toString() === rune.toString()
        ) ||
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

    const etchingByRuneId = new Map(
      this.etchings.map((etching) => [RuneLocation.toString(etching.runeId), etching])
    );

    const etching =
      etchingByRuneId.get(runeLocation) ??
      (await this._storage.getEtching(runeLocation, this.block.height - 1));
    if (etching === null || !etching.valid || !etching.terms) {
      return None;
    }

    const terms = etching.terms;

    const startRelative =
      terms.offset?.start !== undefined ? etching.runeId.block + Number(terms.offset.start) : null;
    const startAbsolute = terms.height?.start !== undefined ? Number(terms.height.start) : null;
    const start =
      startRelative !== null || startAbsolute !== null
        ? Math.max(startRelative ?? -Infinity, startAbsolute ?? -Infinity)
        : null;
    if (start !== null && this.block.height < start) {
      return None;
    }

    const endRelative =
      terms.offset?.end !== undefined ? etching.runeId.block + Number(terms.offset.end) : null;
    const endAbsolute = terms.height?.end !== undefined ? Number(terms.height.end) : null;
    const end =
      endRelative !== null || endAbsolute !== null
        ? Math.max(endRelative ?? -Infinity, endAbsolute ?? -Infinity)
        : null;
    if (end !== null && this.block.height >= end) {
      return None;
    }

    const cap = terms.cap ?? 0n;

    const currentBlockMints = this._mintCountsByRuneLocation.get(runeLocation) ?? {
      mint: id,
      count: 0,
    };
    this._mintCountsByRuneLocation.set(runeLocation, currentBlockMints);

    const totalMints =
      currentBlockMints.count +
      (await this._storage.getValidMintCount(runeLocation, this.block.height - 1));

    if (totalMints >= cap) {
      return None;
    }

    const amount = terms.amount ?? 0n;

    currentBlockMints.count++;

    return Some(amount);
  }

  private async unallocated(tx: UpdaterTx) {
    const unallocated = new Map<string, RuneBalance>();

    const utxoBalancesByOutputLocation = new Map<string, RuneUtxoBalance[]>();
    for (const utxoBalance of this.utxoBalances) {
      const location = `${utxoBalance.txid}:${utxoBalance.vout}`;
      const balances = utxoBalancesByOutputLocation.get(location) ?? [];
      balances.push(utxoBalance);
      utxoBalancesByOutputLocation.set(location, balances);
    }

    for (const input of tx.vin) {
      if ('coinbase' in input) {
        continue;
      }

      const utxoBalance =
        utxoBalancesByOutputLocation.get(`${input.txid}:${input.vout}`) ??
        (await this._storage.getUtxoBalance(input.txid, input.vout));
      this.spentOutputs.push({ txid: input.txid, vout: input.vout });
      for (const additionalBalance of utxoBalance) {
        const runeId = additionalBalance.runeId;
        const runeLocation = RuneLocation.toString(runeId);
        const balance = unallocated.get(runeLocation) ?? { runeId, amount: 0n };
        unallocated.set(runeLocation, balance);
        balance.amount = u128.checkedAddThrow(u128(balance.amount), u128(additionalBalance.amount));
      }
    }

    return unallocated;
  }

  async txCommitsToRune(tx: UpdaterTx, rune: Rune): Promise<boolean> {
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

      const potentiallyTapscript = witnessStack[witnessStack.length - offset];
      if (potentiallyTapscript === undefined) {
        continue;
      }
      const instructions = script.decompile(potentiallyTapscript);
      for (const instruction of instructions) {
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

        const isTaproot = inputTx.vout[input.vout].scriptPubKey.type === TAPROOT_SCRIPT_PUBKEY_TYPE;
        if (!isTaproot) {
          continue;
        }

        const commitTxHeightResult = await this._rpc.getblock({ blockhash: inputTx.blockhash });
        if (commitTxHeightResult.error !== null) {
          throw commitTxHeightResult.error;
        }
        const commitTxHeight = commitTxHeightResult.result.height;

        const confirmations =
          u128.checkedSubThrow(u128(this.block.height), u128(commitTxHeight)) + 1n;

        if (confirmations >= COMMIT_CONFIRMATIONS) {
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
        runeTicker: rune.toString(),
        runeName: new SpacedRune(rune, Number(spacers.map(Number).unwrapOr(0))).toString(),
        runeId,
        txid,
        ...(divisibility.isSome() ? { divisibility: divisibility.map(Number).unwrap() } : {}),
        ...(premine.isSome() ? { premine: premine.unwrap() } : {}),
        ...(symbol.isSome() ? { symbol: symbol.unwrap() } : {}),
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
                            ? { end: unwrappedTerms.height[1].unwrap() }
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
                            ? { end: unwrappedTerms.offset[1].unwrap() }
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
        runeTicker: rune.toString(),
        runeName: rune.toString(),
      });
    }
  }
}
