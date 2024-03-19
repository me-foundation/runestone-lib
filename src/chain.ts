import { SUBSIDY_HALVING_INTERVAL } from './constants';

export enum Chain {
  MAINNET,
  SIGNET,
  TESTNET,
  REGTEST,
}

export namespace Chain {
  export function getFirstRuneHeight(chain: Chain): number {
    switch (chain) {
      case Chain.MAINNET:
        return SUBSIDY_HALVING_INTERVAL * 4;
      case Chain.REGTEST:
        return SUBSIDY_HALVING_INTERVAL * 0;
      case Chain.SIGNET:
        return SUBSIDY_HALVING_INTERVAL * 0;
      case Chain.TESTNET:
        return SUBSIDY_HALVING_INTERVAL * 12;
    }
  }
}
