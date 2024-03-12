import { SUBSIDY_HALVING_INTERVAL } from './constants';
import { u128 } from './u128';

export enum Chain {
  MAINNET,
  SIGNET,
  TESTNET,
  REGTEST,
}

export namespace Chain {
  export function getFirstRuneHeight(chain: Chain): u128 {
    switch (chain) {
      case Chain.MAINNET:
        return u128.saturatingMultiply(SUBSIDY_HALVING_INTERVAL, u128(4n));
      case Chain.REGTEST:
        return u128.saturatingMultiply(SUBSIDY_HALVING_INTERVAL, u128(0n));
      case Chain.SIGNET:
        return u128.saturatingMultiply(SUBSIDY_HALVING_INTERVAL, u128(0n));
      case Chain.TESTNET:
        return u128.saturatingMultiply(SUBSIDY_HALVING_INTERVAL, u128(12n));
    }
  }
}
