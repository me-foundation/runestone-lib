import { None, Option, Some } from '@sniptt/monads';
import { Mint } from './mint';
import { Rune } from './rune';

export class Etching {
  readonly symbol: Option<string>;

  constructor(
    readonly divisibility: number,
    readonly rune: Option<Rune>,
    readonly spacers: number,
    symbol: Option<string>,
    readonly mint: Option<Mint>
  ) {
    this.symbol = symbol.andThen((value) => {
      const codePoint = value.codePointAt(0);
      return codePoint !== undefined
        ? Some(String.fromCodePoint(codePoint))
        : None;
    });
  }
}
