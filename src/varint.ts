import { SeekBuffer } from './seekbuffer';

class DivideByZeroError extends Error {}

export class UInt128 {
  static MAX_VALUE = new UInt128((1n << 128n) - 1n);

  static of(value: bigint) {
    return new UInt128(value);
  }

  static readVarInt(seekBuffer: SeekBuffer): UInt128 {
    let result = UInt128.of(0n);
    do {
      const byte = seekBuffer.readUInt8();
      if (byte === undefined) {
        return result;
      }

      result = result.saturatingMultiply(UInt128.of(128n));

      if (byte < 128) {
        return result.saturatingAdd(UInt128.of(BigInt(byte)));
      }

      result = result.saturatingAdd(UInt128.of(BigInt(byte - 127)));
    } while (true);
  }

  static encodeVarInt(value: UInt128): Buffer {
    const buffer = Buffer.alloc(19);
    let bufindex = 18;

    let bigintValue = value.toBigInt();
    buffer.writeUInt8(Number(bigintValue & 0xffn) & 0b0111_1111, bufindex);
    while (bigintValue > 0b0111_1111) {
      bigintValue = bigintValue / 128n - 1n;
      bufindex--;
      buffer.writeUInt8(Number(bigintValue & 0xffn) | 0b1000_0000, bufindex);
    }

    return buffer.subarray(bufindex);
  }

  private constructor(private readonly value: bigint) {
    if (BigInt.asUintN(128, value) !== value) {
      throw new Error('value is not within range for UInt128');
    }
  }

  saturatingAdd(other: UInt128): UInt128 {
    const bigintResult = this.value + other.value;
    return bigintResult <= UInt128.MAX_VALUE.value
      ? UInt128.of(bigintResult)
      : UInt128.MAX_VALUE;
  }

  saturatingMultiply(other: UInt128): UInt128 {
    const bigintResult = this.value * other.value;
    return bigintResult <= UInt128.MAX_VALUE.value
      ? UInt128.of(bigintResult)
      : UInt128.MAX_VALUE;
  }

  divide(other: UInt128): UInt128 {
    if (other.value === 0n) {
      throw new DivideByZeroError();
    }
    return UInt128.of(this.value / other.value);
  }

  toBigInt() {
    return this.value;
  }
}

export function* getAllUInt128(buffer: Buffer): Generator<UInt128> {
  const seekBuffer = new SeekBuffer(buffer);
  while (!seekBuffer.isFinished()) {
    const nextValue = UInt128.readVarInt(seekBuffer);
    if (nextValue === undefined) {
      return;
    }
    yield nextValue;
  }
}
