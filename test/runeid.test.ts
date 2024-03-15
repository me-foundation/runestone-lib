import { RuneId } from '../src/runeid';
import { u128 } from '../src/u128';

describe('runeid', () => {
  test('rune id to 128', () => {
    expect(new RuneId(3, 1).toU128()).toBe(0b11_0000_0000_0000_0001n);
  });

  test('display', () => {
    expect(new RuneId(1, 2).toString()).toBe('1:2');
  });

  test('from string', () => {
    expect(() => RuneId.fromString(':')).toThrow();
    expect(() => RuneId.fromString('1:')).toThrow();
    expect(() => RuneId.fromString(':2')).toThrow();
    expect(() => RuneId.fromString('a:2')).toThrow();
    expect(() => RuneId.fromString('1:a')).toThrow();
    expect(RuneId.fromString('1:2')).toEqual(new RuneId(1, 2));
  });

  test('from u128', () => {
    expect(RuneId.fromU128(u128(0x060504030201n))).toEqual(
      new RuneId(0x06050403, 0x0201)
    );
  });
});
