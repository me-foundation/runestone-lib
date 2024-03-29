import { Option } from '@sniptt/monads';
import { u128, u64 } from './integer';

export type Terms = {
  cap: Option<u128>;
  height: readonly [Option<u64>, Option<u64>];
  limit: Option<u128>;
  offset: readonly [Option<u64>, Option<u64>];
};
