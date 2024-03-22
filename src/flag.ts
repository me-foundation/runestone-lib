import { u128 } from './u128';

export enum Flag {
  ETCH = 0,
  MINT = 1,
  CENOTAPH = 127,
}

export namespace Flag {
  export function mask(flag: Flag): u128 {
    return u128(1n << BigInt(flag));
  }

  export function take(flags: u128, flag: Flag): { set: boolean; flags: u128 } {
    const mask = Flag.mask(flag);
    const set = (flags & mask) !== 0n;
    return { set, flags: u128(flags - (set ? mask : 0n)) };
  }

  export function set(flags: u128, flag: Flag): u128 {
    return u128(flags | Flag.mask(flag));
  }
}
