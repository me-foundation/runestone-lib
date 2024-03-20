import { Option } from '@sniptt/monads';
import { u128 } from './u128';

export type Mint = {
  deadline: Option<number>;
  limit: Option<u128>;
  term: Option<number>;
};
