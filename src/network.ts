import { SUBSIDY_HALVING_INTERVAL } from './constants';

export enum Network {
  MAINNET,
  SIGNET,
  TESTNET,
  REGTEST,
  FRACTAL,
}

export namespace Network {
  export function getFirstRuneHeight(chain: Network): number {
    switch (chain) {
      case Network.MAINNET:
        return SUBSIDY_HALVING_INTERVAL * 4;
      case Network.REGTEST:
        return SUBSIDY_HALVING_INTERVAL * 0;
      case Network.SIGNET:
        return SUBSIDY_HALVING_INTERVAL * 0;
      case Network.TESTNET:
        return SUBSIDY_HALVING_INTERVAL * 12;
      case Network.FRACTAL:
        return SUBSIDY_HALVING_INTERVAL / 10;
    }
  }
}
