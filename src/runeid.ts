import { u128 } from './u128';

export class RuneId {
  constructor(readonly height: number, readonly index: number) {}

  toU128() {
    return u128((BigInt(this.height) << 16n) | BigInt(this.index));
  }

  toString() {
    return `${this.height}:${this.index}`;
  }

  static fromU128(n: u128) {
    return new RuneId(Number(n >> 16n), Number(n & 0xffffn));
  }

  static fromString(s: string) {
    const parts = s.split(':');
    if (parts.length !== 2) {
      throw new Error(`invalid rune ID: ${s}`);
    }

    const [height, index] = parts;
    if (!/^\d+$/.test(height) || !/^\d+$/.test(index)) {
      throw new Error(`invalid rune ID: ${s}`);
    }
    return new RuneId(Number(BigInt(height)), Number(BigInt(index)));
  }
}
