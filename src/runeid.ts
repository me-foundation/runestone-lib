import { None, Option, Some } from '@sniptt/monads';
import _ from 'lodash';
import { U32_MAX, u128 } from './u128';

export class RuneId {
  constructor(readonly block: number, readonly tx: number) {}

  static new(block: number, tx: number): Option<RuneId> {
    const id = new RuneId(block, tx);

    if (id.block === 0 && id.tx > 0) {
      return None;
    }

    return Some(id);
  }

  static sort(runeIds: RuneId[]): RuneId[] {
    return _.sortBy(runeIds, (runeId) => [runeId.block, runeId.tx]);
  }

  delta(next: RuneId): Option<[u128, u128]> {
    const block = next.block - this.block;
    if (block < 0) {
      return None;
    }

    let tx: number;
    if (block === 0) {
      tx = next.tx - this.tx;
      if (tx < 0) {
        return None;
      }
    } else {
      tx = next.tx;
    }

    return Some([u128(block), u128(tx)]);
  }

  next(block: u128, tx: u128): Option<RuneId> {
    if (block > BigInt(U32_MAX) || tx > BigInt(U32_MAX)) {
      return None;
    }

    const blockNumber = Number(block);
    const txNumber = Number(tx);

    const nextBlock = this.block + blockNumber;
    if (nextBlock > U32_MAX) {
      return None;
    }

    const nextTx = blockNumber === 0 ? this.tx + txNumber : txNumber;
    if (nextTx > U32_MAX) {
      return None;
    }

    return RuneId.new(nextBlock, nextTx);
  }

  toString() {
    return `${this.block}:${this.tx}`;
  }

  static fromString(s: string) {
    const parts = s.split(':');
    if (parts.length !== 2) {
      throw new Error(`invalid rune ID: ${s}`);
    }

    const [block, tx] = parts;
    if (!/^\d+$/.test(block) || !/^\d+$/.test(tx)) {
      throw new Error(`invalid rune ID: ${s}`);
    }
    return new RuneId(Number(BigInt(block)), Number(BigInt(tx)));
  }
}
