type Vin = {
  txid: string;
  vout: number;
  scriptSig: {
    asm: string;
    hex: string;
  };
  txinwitness: string[];
  sequence: number;
};

type VinCoinbase = {
  coinbase: string;
  txinwitness: string[];
  sequence: number;
};

type Vout = {
  value: number;
  n: number;
  scriptPubKey: {
    asm: string;
    desc: string;
    hex: string;
    type: string;
    address?: string;
  };
};

export type Tx = {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  vin: (Vin | VinCoinbase)[];
  vout: Vout[];
};

type BitcoinBlock = {
  hash: string;
  confirmations: number;
  size: number;
  strippedsize: number;
  weight: number;
  height: number;
  version: number;
  versionHex: string;
  merkleroot: string;
  time: number;
  mediantime: number;
  nonce: number;
  bits: string;
  difficulty: number;
  chainwork: string;
  nTx: number;
  previousblockhash: string;
};

export type GetBlockParams = {
  blockhash: string;
  verbosity?: 0 | 1 | 2;
};

export type GetBlockhashParams = {
  height: number;
};

export type GetBlockReturn<T> = T extends { verbosity: 0 }
  ? string
  : T extends { verbosity: 1 }
  ? { tx: string[] } & BitcoinBlock
  : T extends { verbosity: 2 }
  ? { tx: Tx[] } & BitcoinBlock
  : { tx: string[] } & BitcoinBlock;

export type RpcResponse<T> =
  | {
      result: T;
      error: null;
    }
  | {
      result: null;
      error: {};
    };

export interface BitcoinRpcClient {
  getblockhash({ height }: GetBlockhashParams): Promise<RpcResponse<string>>;
  getblock<T extends GetBlockParams>({
    verbosity,
    blockhash,
  }: T): Promise<RpcResponse<GetBlockReturn<T>>>;
}
