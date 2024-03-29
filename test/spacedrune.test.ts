import { Rune } from '../src/rune';
import { SpacedRune } from '../src/spacedrune';
import { u128 } from '../src/integer/u128';

describe('SpacedRune', () => {
  test('display', () => {
    expect(SpacedRune.fromString('A.B').toString()).toBe('A•B');
    expect(SpacedRune.fromString('A.B.C').toString()).toBe('A•B•C');
    expect(new SpacedRune(new Rune(u128(0)), 1).toString()).toBe('A');
  });

  test('fromString', () => {
    function testcase(s: string, rune: string, spacers: number) {
      expect(SpacedRune.fromString(s)).toEqual(new SpacedRune(Rune.fromString(rune), spacers));
    }

    expect(() => SpacedRune.fromString('.A')).toThrow('leading spacer');
    expect(() => SpacedRune.fromString('A..B')).toThrow('double spacer');
    expect(() => SpacedRune.fromString('A.')).toThrow('trailing spacer');
    expect(() => SpacedRune.fromString('Ax')).toThrow('invalid character');

    testcase('A.B', 'AB', 0b1);
    testcase('A.B.C', 'ABC', 0b11);
    testcase('A•B', 'AB', 0b1);
    testcase('A•B•C', 'ABC', 0b11);
    testcase('A•BC', 'ABC', 0b1);
  });
});
