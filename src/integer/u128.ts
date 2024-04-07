import { None, Option, Some } from '../monads';
import { SeekBuffer } from '../seekbuffer';
import { u64 } from './u64';
import { u32 } from './u32';
import { u8 } from './u8';

/**
 * A little utility type used for nominal typing.
 *
 * See {@link https://michalzalecki.com/nominal-typing-in-typescript/}
 */
type BigTypedNumber<T> = bigint & {
  /**
   * # !!! DO NOT USE THIS PROPERTY IN YOUR CODE !!!
   * ## This is just used to make each `BigTypedNumber` alias unique for Typescript and doesn't actually exist.
   * @ignore
   * @private
   * @readonly
   * @type {undefined}
   */
  readonly __kind__: T;
};

/**
 * ## 128-bit unsigned integer
 *
 * - **Value Range:** `0` to `340282366920938463463374607431768211455`
 * - **Size in bytes:** `16`
 * - **Web IDL type:** `bigint`
 * - **Equivalent C type:** `uint128_t`
 */
export type u128 = BigTypedNumber<'u128'>;

export const U128_MAX_BIGINT = 0xffff_ffff_ffff_ffff_ffff_ffff_ffff_ffffn;

/**
 * Convert Number or BigInt to 128-bit unsigned integer.
 * @param num - The Number or BigInt to convert.
 * @returns - The resulting 128-bit unsigned integer (BigInt).
 */
export function u128(num: number | bigint): u128 {
  const bigNum = typeof num == 'bigint' ? num : BigInt(num);
  return (bigNum & U128_MAX_BIGINT) as u128;
}

export namespace u128 {
  export const MAX = u128(U128_MAX_BIGINT);

  export function checkedAdd(x: u128, y: u128): Option<u128> {
    const result = x + y;
    if (result > u128.MAX) {
      return None;
    }

    return Some(u128(result));
  }

  export function checkedAddThrow(x: u128, y: u128): u128 {
    const option = u128.checkedAdd(x, y);
    if (option.isNone()) {
      throw new Error('checked add overflow');
    }
    return option.unwrap();
  }

  export function checkedSub(x: u128, y: u128): Option<u128> {
    const result = x - y;
    if (result < 0n) {
      return None;
    }

    return Some(u128(result));
  }

  export function checkedSubThrow(x: u128, y: u128): u128 {
    const option = u128.checkedSub(x, y);
    if (option.isNone()) {
      throw new Error('checked sub overflow');
    }
    return option.unwrap();
  }

  export function checkedMultiply(x: u128, y: u128): Option<u128> {
    const result = x * y;
    if (result > u128.MAX) {
      return None;
    }

    return Some(u128(result));
  }

  export function saturatingAdd(x: u128, y: u128): u128 {
    const result = x + y;
    return result > u128.MAX ? u128.MAX : u128(result);
  }

  export function saturatingMultiply(x: u128, y: u128): u128 {
    const result = x * y;
    return result > u128.MAX ? u128.MAX : u128(result);
  }

  export function saturatingSub(x: u128, y: u128): u128 {
    return u128(x < y ? 0 : x - y);
  }

  export function decodeVarInt(seekBuffer: SeekBuffer): Option<u128> {
    try {
      return Some(tryDecodeVarInt(seekBuffer));
    } catch (e) {
      return None;
    }
  }

  export function tryDecodeVarInt(seekBuffer: SeekBuffer): u128 {
    let result = u128(0);
    for (let i = 0; i <= 18; i++) {
      const byte = seekBuffer.readUInt8();
      if (byte === undefined) {
        throw new Error('Unterminated');
      }

      const value = u128(byte) & 0b0111_1111n;

      if (i === 18 && (value & 0b0111_1100n) !== 0n) {
        throw new Error('Overflow');
      }

      result = u128(result | (value << u128(7 * i)));

      if ((byte & 0b1000_0000) === 0) {
        return result;
      }
    }

    throw new Error('Overlong');
  }

  export function encodeVarInt(value: u128): Buffer {
    const v: number[] = [];
    while (value >> 7n > 0n) {
      v.push(Number(value & 0xffn) | 0b1000_0000);
      value = u128(value >> 7n);
    }
    v.push(Number(value & 0xffn));

    return Buffer.from(v);
  }

  export function tryIntoU64(n: u128): Option<u64> {
    return n > u64.MAX ? None : Some(u64(n));
  }

  export function tryIntoU32(n: u128): Option<u32> {
    return n > u32.MAX ? None : Some(u32(n));
  }

  export function tryIntoU8(n: u128): Option<u8> {
    return n > u8.MAX ? None : Some(u8(n));
  }
}

export function* getAllU128(buffer: Buffer): Generator<u128> {
  const seekBuffer = new SeekBuffer(buffer);
  while (!seekBuffer.isFinished()) {
    const nextValue = u128.tryDecodeVarInt(seekBuffer);
    if (nextValue === undefined) {
      return;
    }
    yield nextValue;
  }
}
