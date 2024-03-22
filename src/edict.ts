import * as bitcoin from 'bitcoinjs-lib';
import { Option, Some, None } from '@sniptt/monads';
import { RuneId } from './runeid';
import { u128 } from './u128';

export type Edict = {
  id: RuneId;
  amount: u128;
  output: u128;
};

export namespace Edict {
  export function fromIntegers(
    tx: bitcoin.Transaction,
    id: u128,
    amount: u128,
    output: u128
  ): Option<Edict> {
    const runeId = RuneId.fromU128(id);

    if (runeId.block === 0 && runeId.tx > 0) {
      return None;
    }

    if (output > u128(tx.outs.length)) {
      return None;
    }

    return Some({ id: runeId, amount, output });
  }
}
