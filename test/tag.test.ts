import { Some, None } from '@sniptt/monads';
import { Tag } from '../src/tag';
import { u128 } from '../src/u128';

describe('tag', () => {
  test('usable as numbers', () => {
    expect(Tag.BODY).toBe(0);
    expect(Tag.FLAGS).toBe(2);
  });

  test('take', () => {
    const fields = new Map<u128, u128[]>();
    fields.set(u128(2), [u128(3)]);

    expect(Tag.take(Tag.FLAGS, fields, 1, () => None).isNone()).toBe(true);
    expect(fields.size).not.toBe(0);
    expect(
      Tag.take(Tag.FLAGS, fields, 1, ([flags]) => Some(flags)).unwrap()
    ).toBe(3n);
    expect(fields.size).toBe(0);
    expect(
      Tag.take(Tag.FLAGS, fields, 1, ([flags]) => Some(flags)).isNone()
    ).toBe(true);
  });

  test('take leaves unconsumed values', () => {
    const fields = new Map<u128, u128[]>();
    fields.set(u128(2), [1, 2, 3].map(u128));

    expect(fields.get(u128(2))?.length).toBe(3);

    expect(Tag.take(Tag.FLAGS, fields, 1, () => None).isNone()).toBe(true);

    expect(fields.get(u128(2))?.length).toBe(3);

    expect(
      Tag.take(Tag.FLAGS, fields, 2, ([a, b]) => Some([a, b])).unwrap()
    ).toEqual([1n, 2n]);

    expect(fields.get(u128(2))?.length).toBe(1);

    expect(Tag.take(Tag.FLAGS, fields, 1, ([a]) => Some([a])).unwrap()).toEqual(
      [3n]
    );

    expect(fields.get(u128(2))).toBeUndefined();
  });

  test('encode', () => {
    expect([...Tag.encode(Tag.FLAGS, [3].map(u128))]).toEqual([2, 3]);
    expect([...Tag.encode(Tag.RUNE, [5].map(u128))]).toEqual([4, 5]);
    expect([...Tag.encode(Tag.RUNE, [5, 6].map(u128))]).toEqual([4, 5, 4, 6]);
  });

  test('burn and nop are one byte', () => {
    expect(Tag.encode(Tag.CENOTAPH, [u128(0)]).length).toBe(2);
    expect(Tag.encode(Tag.NOP, [u128(0)]).length).toBe(2);
  });
});
