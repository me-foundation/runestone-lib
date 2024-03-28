import { Option } from '@sniptt/monads';
import { u128 } from './u128';

export type Mint = {
  cap: Option<u128>; // mint cap
  deadline: Option<number>; // unix timestamp
  limit: Option<u128>; // claim amount
  term: Option<number>; // relative block height
};
