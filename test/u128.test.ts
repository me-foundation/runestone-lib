import _ from 'lodash';
import { SeekBuffer } from '../src/seekbuffer';
import { u128 } from '../src/u128';

describe('u128 functions', () => {
  test('u128 always casts value correctly', () => {
    expect(u128(0)).toBe(0n);
    expect(u128(1)).toBe(1n);
    expect(u128(2n ** 128n - 1n)).toBe(
      340282366920938463463374607431768211455n
    );
    expect(u128(2n ** 128n)).toBe(0n);
    expect(u128(-1)).toBe(340282366920938463463374607431768211455n);
    expect(() => u128(1.2)).toThrow();
  });

  test('u128 checked operations errors on overflow', () => {
    expect(u128.checkedAdd(u128(45n), u128(25n))).toBe(70n);
    expect(u128.checkedMultiply(u128(45n), u128(25n))).toBe(1125n);

    expect(() => u128.checkedAdd(u128(2n ** 127n), u128(2n ** 127n))).toThrow();
    expect(() =>
      u128.checkedMultiply(u128(2n ** 127n), u128(2n ** 127n))
    ).toThrow();
  });

  test('u128 saturating operations work as expected', () => {
    expect(u128.saturatingAdd(u128(45n), u128(25n))).toBe(70n);
    expect(u128.saturatingMultiply(u128(45n), u128(25n))).toBe(1125n);
    expect(u128.saturatingSub(u128(45n), u128(25n))).toBe(20n);

    expect(u128.saturatingAdd(u128(2n ** 127n), u128(2n ** 127n))).toBe(
      u128.MAX
    );
    expect(u128.saturatingMultiply(u128(2n ** 127n), u128(2n ** 127n))).toBe(
      u128.MAX
    );
    expect(u128.saturatingSub(u128(2n), u128(2n ** 127n))).toBe(0n);
  });
});

describe('u128 varint encoding', () => {
  test('encode/decode varints roundtrips correctly', () => {
    const n = u128.MAX;
    const encoded = u128.encodeVarInt(n);

    const seekBuffer = new SeekBuffer(encoded);
    const decoded = u128.readVarInt(seekBuffer);

    expect(decoded).toBe(n);
    expect(seekBuffer.isFinished()).toBe(true);
  });

  it.each([_.range(0, 128)])(
    'round trips powers of two successfully (2 ^ %i)',
    (powerOfTwo) => {
      const n = u128(1n << BigInt(powerOfTwo));
      const encoded = u128.encodeVarInt(n);

      const seekBuffer = new SeekBuffer(encoded);
      const decoded = u128.readVarInt(seekBuffer);

      expect(decoded).toBe(n);
      expect(seekBuffer.isFinished()).toBe(true);
    }
  );

  test('round trips alternating bit strings successfully', () => {
    let value = 0n;

    for (const i in _.range(0, 129)) {
      value = (value << 1n) | value % 2n;

      const n = u128(value);
      const encoded = u128.encodeVarInt(n);

      const seekBuffer = new SeekBuffer(encoded);
      const decoded = u128.readVarInt(seekBuffer);

      expect(decoded).toBe(n);
      expect(seekBuffer.isFinished()).toBe(true);
    }
  });

  test('large varints saturate to maximum', () => {
    const seekBuffer = new SeekBuffer(
      Buffer.from([
        130, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254,
        254, 254, 254, 255, 0,
      ])
    );
    const decoded = u128.readVarInt(seekBuffer);
    expect(decoded).toBe(u128.MAX);
  });

  test('truncated large varints with large final byte saturate to maximum', () => {
    const seekBuffer = new SeekBuffer(
      Buffer.from([
        130, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254,
        254, 254, 254, 255, 255,
      ])
    );
    const decoded = u128.readVarInt(seekBuffer);
    expect(decoded).toBe(u128.MAX);
  });

  test('varints with large final byte saturate to maximum', () => {
    const seekBuffer = new SeekBuffer(
      Buffer.from([
        130, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254,
        254, 254, 254, 255, 127,
      ])
    );
    const decoded = u128.readVarInt(seekBuffer);
    expect(decoded).toBe(u128.MAX);
  });

  it.each([
    [0n, [0x00]],
    [1n, [0x01]],
    [127n, [0x7f]],
    [128n, [0x80, 0x00]],
    [255n, [0x80, 0x7f]],
    [256n, [0x81, 0x00]],
    [16383n, [0xfe, 0x7f]],
    [16384n, [0xff, 0x00]],
    [16511n, [0xff, 0x7f]],
    [65535n, [0x82, 0xfe, 0x7f]],
    [1n << 32n, [0x8e, 0xfe, 0xfe, 0xff, 0x00]],
  ])(
    'taproot annex format bip test vectors round trip successfully',
    (n, encoding) => {
      const actualEncoding = u128.encodeVarInt(u128(n));
      expect([...actualEncoding]).toEqual(encoding);

      const seekBuffer = new SeekBuffer(Buffer.from(encoding));
      const actualu128 = u128.readVarInt(seekBuffer);

      expect(actualu128).toBe(n);
      expect(seekBuffer.isFinished()).toBe(true);
    }
  );

  test('varints may be truncated', () => {
    const seekBuffer = new SeekBuffer(Buffer.from([128]));
    const decoded = u128.readVarInt(seekBuffer);

    expect(decoded).toBe(1n);
  });
});
