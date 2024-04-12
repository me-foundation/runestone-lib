import * as _ from 'lodash';
import { SeekBuffer } from '../src/seekbuffer';
import { u128 } from '../src/integer/u128';

describe('u128 functions', () => {
  test('u128 always casts value correctly', () => {
    expect(u128(0)).toBe(0n);
    expect(u128(1)).toBe(1n);
    expect(u128(2n ** 128n - 1n)).toBe(340282366920938463463374607431768211455n);
    expect(u128(2n ** 128n)).toBe(0n);
    expect(u128(-1)).toBe(340282366920938463463374607431768211455n);
    expect(() => u128(1.2)).toThrow();
  });

  test('u128 checked operations errors on overflow', () => {
    expect(u128.checkedAdd(u128(45n), u128(25n)).unwrap()).toBe(70n);
    expect(u128.checkedMultiply(u128(45n), u128(25n)).unwrap()).toBe(1125n);

    expect(() => u128.checkedAdd(u128(2n ** 127n), u128(2n ** 127n)).unwrap()).toThrow();
    expect(() => u128.checkedMultiply(u128(2n ** 127n), u128(2n ** 127n)).unwrap()).toThrow();
  });

  test('u128 saturating operations work as expected', () => {
    expect(u128.saturatingAdd(u128(45n), u128(25n))).toBe(70n);
    expect(u128.saturatingMultiply(u128(45n), u128(25n))).toBe(1125n);
    expect(u128.saturatingSub(u128(45n), u128(25n))).toBe(20n);

    expect(u128.saturatingAdd(u128(2n ** 127n), u128(2n ** 127n))).toBe(u128.MAX);
    expect(u128.saturatingMultiply(u128(2n ** 127n), u128(2n ** 127n))).toBe(u128.MAX);
    expect(u128.saturatingSub(u128(2n), u128(2n ** 127n))).toBe(0n);
  });
});

describe('u128 varint encoding', () => {
  test('zero round trips successfully', () => {
    const n = u128(0);
    const encoded = u128.encodeVarInt(n);

    const seekBuffer = new SeekBuffer(encoded);
    const decoded = u128.tryDecodeVarInt(seekBuffer);

    expect(decoded).toBe(n);
    expect(seekBuffer.isFinished()).toBe(true);
  });

  test('encode/decode varints roundtrips correctly', () => {
    const n = u128.MAX;
    const encoded = u128.encodeVarInt(n);

    const seekBuffer = new SeekBuffer(encoded);
    const decoded = u128.tryDecodeVarInt(seekBuffer);

    expect(decoded).toBe(n);
    expect(seekBuffer.isFinished()).toBe(true);
  });

  it.each([_.range(0, 128)])('round trips powers of two successfully (2 ^ %i)', (powerOfTwo) => {
    const n = u128(1n << BigInt(powerOfTwo));
    const encoded = u128.encodeVarInt(n);

    const seekBuffer = new SeekBuffer(encoded);
    const decoded = u128.tryDecodeVarInt(seekBuffer);

    expect(decoded).toBe(n);
    expect(seekBuffer.isFinished()).toBe(true);
  });

  test('round trips alternating bit strings successfully', () => {
    let value = 0n;

    for (const i in _.range(0, 129)) {
      value = (value << 1n) | value % 2n;

      const n = u128(value);
      const encoded = u128.encodeVarInt(n);

      const seekBuffer = new SeekBuffer(encoded);
      const decoded = u128.tryDecodeVarInt(seekBuffer);

      expect(decoded).toBe(n);
      expect(seekBuffer.isFinished()).toBe(true);
    }
  });

  test('varints may not be longer than 19 bytes', () => {
    const VALID = new SeekBuffer(
      Buffer.from([
        128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 0,
      ])
    );
    const INVALID = new SeekBuffer(
      Buffer.from([
        128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128,
        128, 0,
      ])
    );

    expect(u128.tryDecodeVarInt(VALID)).toBe(u128(0));
    expect(() => u128.tryDecodeVarInt(INVALID)).toThrow('Overlong');
  });

  test('varints may not overflow u128', () => {
    expect(() =>
      u128.tryDecodeVarInt(
        new SeekBuffer(
          Buffer.from([
            128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128,
            128, 64,
          ])
        )
      )
    ).toThrow('Overflow');
    expect(() =>
      u128.tryDecodeVarInt(
        new SeekBuffer(
          Buffer.from([
            128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128,
            128, 32,
          ])
        )
      )
    ).toThrow('Overflow');
    expect(() =>
      u128.tryDecodeVarInt(
        new SeekBuffer(
          Buffer.from([
            128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128,
            128, 16,
          ])
        )
      )
    ).toThrow('Overflow');
    expect(() =>
      u128.tryDecodeVarInt(
        new SeekBuffer(
          Buffer.from([
            128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128,
            128, 8,
          ])
        )
      )
    ).toThrow('Overflow');
    expect(() =>
      u128.tryDecodeVarInt(
        new SeekBuffer(
          Buffer.from([
            128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128,
            128, 4,
          ])
        )
      )
    ).toThrow('Overflow');
    expect(
      u128.tryDecodeVarInt(
        new SeekBuffer(
          Buffer.from([
            128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128,
            128, 2,
          ])
        )
      )
    ).toBe(u128(2n ** 127n));
  });

  test('varints must be terminated', () => {
    expect(() => u128.tryDecodeVarInt(new SeekBuffer(Buffer.from([128])))).toThrow('Unterminated');
  });
});
