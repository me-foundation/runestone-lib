import { None, Option, Some } from '@sniptt/monads';
import { Mint } from './mint';
import { Rune } from './rune';
import { u128 } from './u128';

export class Etching {
  readonly symbol: Option<string>;

  constructor(
    readonly divisibility: Option<number>,
    readonly rune: Option<Rune>,
    readonly spacers: Option<number>,
    symbol: Option<string>,
    readonly mint: Option<Mint>,
    readonly premine: Option<u128>
  ) {
    this.symbol = symbol.andThen((value) => {
      const codePoint = value.codePointAt(0);
      return codePoint !== undefined
        ? Some(String.fromCodePoint(codePoint))
        : None;
    });
  }
}
