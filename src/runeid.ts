import { u128 } from './u128';

export class RuneId {
  constructor(readonly block: number, readonly tx: number) {}

  toU128() {
    return u128((BigInt(this.block) << 16n) | BigInt(this.tx));
  }

  toString() {
    return `${this.block}:${this.tx}`;
  }

  static fromU128(n: u128) {
    return new RuneId(Number(n >> 16n), Number(n & 0xffffn));
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
