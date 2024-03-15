import { Mint } from './mint';
import { Rune } from './rune';

export type Etching = {
  divisibility: number;
  mint?: Mint;
  rune?: Rune;
  spacers: number;
  symbol?: string;
};
