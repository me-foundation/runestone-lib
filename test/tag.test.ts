import { Tag } from '../src/tag';
import { u128 } from '../src/u128';

describe('tag', () => {
  test('usable as numbers', () => {
    expect(Tag.BODY).toBe(0);
    expect(Tag.FLAGS).toBe(2);
  });

  test('take', () => {
    const fields = new Map<u128, u128>();
    fields.set(u128(2), u128(3));

    expect(Tag.take(fields, Tag.FLAGS)).toBe(3n);
    expect(fields.size).toBe(0);
    expect(Tag.take(fields, Tag.FLAGS)).toBeUndefined();
  });

  test('encode', () => {
    expect([...Tag.encode(Tag.FLAGS, u128(3))]).toEqual([2, 3]);
  });

  test('burn and nop are one byte', () => {
    expect(Tag.encode(Tag.BURN, u128(0)).length).toBe(2);
    expect(Tag.encode(Tag.NOP, u128(0)).length).toBe(2);
  });
});
