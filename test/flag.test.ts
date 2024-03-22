import { Flag } from '../src/flag';
import { u128 } from '../src/u128';

describe('flag', () => {
  test('mask', () => {
    expect(Flag.mask(Flag.ETCH)).toBe(0b1n);
    expect(Flag.mask(Flag.CENOTAPH)).toBe(1n << 127n);
  });

  test('take', () => {
    {
      const flags = u128(1);
      const { set, flags: updatedFlags } = Flag.take(flags, Flag.ETCH);
      expect(set).toBe(true);
      expect(updatedFlags).toBe(0n);
    }

    {
      const flags = u128(0);
      const { set, flags: updatedFlags } = Flag.take(flags, Flag.ETCH);
      expect(set).toBe(false);
      expect(updatedFlags).toBe(0n);
    }
  });

  test('set', () => {
    const flags = u128(0);
    const updatedFlags = Flag.set(flags, Flag.ETCH);
    expect(updatedFlags).toBe(1n);
  });
});
