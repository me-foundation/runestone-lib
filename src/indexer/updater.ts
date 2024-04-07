import { Artifact, isRunestone } from '../artifact';
import { COMMIT_INTERVAL, OP_RETURN, TAPROOT_ANNEX_PREFIX } from '../constants';
import { u128, u32, u64 } from '../integer';
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

export class RuneUpdater implements RuneBlockIndex {
  block: BlockInfo;
  etchings: RuneEtching[] = [];
  mintCounts: Map<string, number> = new Map();
  utxoBalances: RuneUtxoBalance[] = [];

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
              .filter(
                ([_, vout]) =>
                  !vout.scriptPubKey.hex ||
                  Buffer.from(vout.scriptPubKey.hex, 'hex')[0] !== OP_RETURN
              )
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
        // self.create_rune_entry(txid, artifact, id, rune)?;
      }
    }
  }

  //     let mut burned: HashMap<RuneId, Lot> = HashMap::new();

  //     if let Some(Artifact::Cenotaph(_)) = artifact {
  //       for (id, balance) in unallocated {
  //         *burned.entry(id).or_default() += balance;
  //       }
  //     } else {
  //       let pointer = artifact
  //         .map(|artifact| match artifact {
  //           Artifact::Runestone(runestone) => runestone.pointer,
  //           Artifact::Cenotaph(_) => unreachable!(),
  //         })
  //         .unwrap_or_default();

  //       // assign all un-allocated runes to the default output, or the first non
  //       // OP_RETURN output if there is no default, or if the default output is
  //       // too large
  //       if let Some(vout) = pointer
  //         .map(|pointer| pointer.into_usize())
  //         .inspect(|&pointer| assert!(pointer < allocated.len()))
  //         .or_else(|| {
  //           tx.output
  //             .iter()
  //             .enumerate()
  //             .find(|(_vout, tx_out)| !tx_out.script_pubkey.is_op_return())
  //             .map(|(vout, _tx_out)| vout)
  //         })
  //       {
  //         for (id, balance) in unallocated {
  //           if balance > 0 {
  //             *allocated[vout].entry(id).or_default() += balance;
  //           }
  //         }
  //       } else {
  //         for (id, balance) in unallocated {
  //           if balance > 0 {
  //             *burned.entry(id).or_default() += balance;
  //           }
  //         }
  //       }
  //     }

  //     // update outpoint balances
  //     let mut buffer: Vec<u8> = Vec::new();
  //     for (vout, balances) in allocated.into_iter().enumerate() {
  //       if balances.is_empty() {
  //         continue;
  //       }

  //       // increment burned balances
  //       if tx.output[vout].script_pubkey.is_op_return() {
  //         for (id, balance) in &balances {
  //           *burned.entry(*id).or_default() += *balance;
  //         }
  //         continue;
  //       }

  //       buffer.clear();

  //       let mut balances = balances.into_iter().collect::<Vec<(RuneId, Lot)>>();

  //       // Sort balances by id so tests can assert balances in a fixed order
  //       balances.sort();

  //       for (id, balance) in balances {
  //         Index::encode_rune_balance(id, balance.n(), &mut buffer);
  //       }

  //       self.outpoint_to_balances.insert(
  //         &OutPoint {
  //           txid,
  //           vout: vout.try_into().unwrap(),
  //         }
  //         .store(),
  //         buffer.as_slice(),
  //       )?;
  //     }

  //     // increment entries with burned runes
  //     for (id, amount) in burned {
  //       *self.burned.entry(id).or_default() += amount;
  //     }

  //     Ok(())
  //   }

  //   pub(super) fn update(self) -> Result {
  //     for (rune_id, burned) in self.burned {
  //       let mut entry = RuneEntry::load(self.id_to_entry.get(&rune_id.store())?.unwrap().value());
  //       entry.burned = entry.burned.checked_add(burned.n()).unwrap();
  //       self.id_to_entry.insert(&rune_id.store(), entry.store())?;
  //     }

  //     Ok(())
  //   }

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
}

//   fn create_rune_entry(
//     &mut self,
//     txid: Txid,
//     artifact: &Artifact,
//     id: RuneId,
//     rune: Rune,
//   ) -> Result {
//     self.rune_to_id.insert(rune.store(), id.store())?;
//     self
//       .transaction_id_to_rune
//       .insert(&txid.store(), rune.store())?;

//     let number = self.runes;
//     self.runes += 1;

//     self
//       .statistic_to_count
//       .insert(&Statistic::Runes.into(), self.runes)?;

//     let entry = match artifact {
//       Artifact::Cenotaph(_) => RuneEntry {
//         block: id.block,
//         burned: 0,
//         divisibility: 0,
//         etching: txid,
//         terms: None,
//         mints: 0,
//         number,
//         premine: 0,
//         spaced_rune: SpacedRune { rune, spacers: 0 },
//         symbol: None,
//         timestamp: self.block_time.into(),
//       },
//       Artifact::Runestone(Runestone { etching, .. }) => {
//         let Etching {
//           divisibility,
//           terms,
//           premine,
//           spacers,
//           symbol,
//           ..
//         } = etching.unwrap();

//         RuneEntry {
//           block: id.block,
//           burned: 0,
//           divisibility: divisibility.unwrap_or_default(),
//           etching: txid,
//           terms,
//           mints: 0,
//           number,
//           premine: premine.unwrap_or_default(),
//           spaced_rune: SpacedRune {
//             rune,
//             spacers: spacers.unwrap_or_default(),
//           },
//           symbol,
//           timestamp: self.block_time.into(),
//         }
//       }
//     };

//     self.id_to_entry.insert(id.store(), entry.store())?;

//     let inscription_id = InscriptionId { txid, index: 0 };

//     if let Some(sequence_number) = self
//       .inscription_id_to_sequence_number
//       .get(&inscription_id.store())?
//     {
//       self
//         .sequence_number_to_rune_id
//         .insert(sequence_number.value(), id.store())?;
//     }

//     Ok(())
//   }

// }
