import { SeekBuffer } from './seekbuffer';

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
  export class OverflowError extends Error {}

  export const MAX = u128(U128_MAX_BIGINT);

  export function checkedAdd(x: u128, y: u128): u128 {
    const result = x + y;
    if (result > u128.MAX) {
      throw new OverflowError();
    }

    return u128(result);
  }

  export function checkedMultiply(x: u128, y: u128): u128 {
    const result = x * y;
    if (result > u128.MAX) {
      throw new OverflowError();
    }

    return u128(result);
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

  export function readVarInt(seekBuffer: SeekBuffer): u128 {
    let result = u128(0);
    do {
      const byte = seekBuffer.readUInt8();
      if (byte === undefined) {
        return result;
      }

      result = u128.saturatingMultiply(result, u128(128));

      if (byte < 128) {
        return u128.saturatingAdd(result, u128(byte));
      }

      result = u128.saturatingAdd(result, u128(byte - 127));
    } while (true);
  }

  export function encodeVarInt(value: u128): Buffer {
    const buffer = Buffer.alloc(19);
    let bufindex = 18;

    buffer.writeUInt8(Number(value & 0xffn) & 0b0111_1111, bufindex);
    while (value > 0b0111_1111) {
      value = u128(value / 128n - 1n);
      bufindex--;
      buffer.writeUInt8(Number(value & 0xffn) | 0b1000_0000, bufindex);
    }

    return buffer.subarray(bufindex);
  }
}

export function* getAllU128(buffer: Buffer): Generator<u128> {
  const seekBuffer = new SeekBuffer(buffer);
  while (!seekBuffer.isFinished()) {
    const nextValue = u128.readVarInt(seekBuffer);
    if (nextValue === undefined) {
      return;
    }
    yield nextValue;
  }
}
