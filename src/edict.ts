import * as bitcoin from 'bitcoinjs-lib';
import { Option, Some, None } from '@sniptt/monads';
import { RuneId } from './runeid';
import { U32_MAX, u128 } from './u128';

export type Edict = {
  id: RuneId;
  amount: u128;
  output: number;
};

export namespace Edict {
  export function fromIntegers(
    tx: bitcoin.Transaction,
    id: RuneId,
    amount: u128,
    output: u128
  ): Option<Edict> {
    if (id.block === 0 && id.tx > 0) {
      return None;
    }

    if (output > u128(U32_MAX)) {
      return None;
    }

    if (output > tx.outs.length) {
      return None;
    }

    return Some({ id, amount, output: Number(output) });
  }
}
