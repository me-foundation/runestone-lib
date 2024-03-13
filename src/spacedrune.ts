import { Rune } from './rune';

export class SpacedRune {
  constructor(readonly rune: Rune, readonly spacers: number) {}

  static fromString(s: string): SpacedRune {
    let rune = '';
    let spacers = 0;

    for (const c of s) {
      if ('A' <= c && c <= 'Z') {
        rune += c;
      } else if ('.' === c || '•' === c) {
        if (rune.length === 0) {
          throw new Error('leading spacer');
        }
        const flag = 1 << (rune.length - 1);
        if ((spacers & flag) !== 0) {
          throw new Error('double spacer');
        }
        spacers |= flag;
      } else {
        throw new Error('invalid character');
      }
    }

    if (spacers >= 1 << (rune.length - 1)) {
      throw new Error('trailing spacer');
    }

    return new SpacedRune(Rune.fromString(rune), spacers);
  }

  toString(): string {
    const rune = this.rune.toString();
    let i = 0;
    let result = '';
    for (const c of rune) {
      result += c;

      if (i < rune.length - 1 && (this.spacers & (1 << i)) !== 0) {
        result += '•';
      }
      i++;
    }

    return result;
  }
}
