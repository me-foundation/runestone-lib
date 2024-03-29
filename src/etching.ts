import { None, Option, Some } from '@sniptt/monads';
import { Terms } from './terms';
import { Rune } from './rune';
import { u128, u32, u8 } from './integer';

export class Etching {
  readonly symbol: Option<string>;

  constructor(
    readonly divisibility: Option<u8>,
    readonly rune: Option<Rune>,
    readonly spacers: Option<u32>,
    symbol: Option<string>,
    readonly terms: Option<Terms>,
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
