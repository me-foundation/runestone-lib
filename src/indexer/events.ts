import { Edict } from '../edict';
import { Etching } from '../etching';

export type Runestone = {
  claim: boolean;
  burn: boolean;
  edicts: Edict[];
  etching?: Etching;
};

export type RunestoneEvent = {
  txid: string;
  blockhash: string;
  blockheight: number;
  blockTxIndex: number;
  encodedBytes: Buffer;

  runestone: Runestone;
};
