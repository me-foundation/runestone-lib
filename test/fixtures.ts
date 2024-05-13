import { Etching } from '../src/etching';
import { u64, u32, u128, u8 } from '../src/integer';
import { Some, None } from '../src/monads';
import { Rune } from '../src/rune';
import { RuneId } from '../src/runeid';
import { Runestone } from '../src/runestone';

export function getDeployRunestoneHex({
  mint,
  pointer,
  edicts,
  etching,
}: {
  mint?: [number, number];
  pointer?: number;
  edicts?: {
    id: [number, number];
    amount: number;
    output: number;
  }[];
  etching?: {
    divisibility?: number;
    rune?: string;
    spacers?: number;
    symbol?: string;
    terms?: {
      amount: number;
      cap: number;
      height?: { start?: number; end?: number };
      offset?: { start?: number; end?: number };
    };
    premine?: number;
  };
}) {
  return new Runestone(
    mint !== undefined ? Some(new RuneId(u64(mint[0]), u32(mint[1]))) : None,
    pointer !== undefined ? Some(pointer) : None,
    edicts?.map((edict) => ({
      id: new RuneId(u64(edict.id[0]), u32(edict.id[1])),
      amount: u128(edict.amount),
      output: u32(edict.output),
    })) ?? [],
    etching !== undefined
      ? Some(
          new Etching(
            etching.divisibility !== undefined ? Some(u8(etching.divisibility)) : None,
            etching.rune !== undefined ? Some(Rune.fromString(etching.rune)) : None,
            etching.spacers !== undefined ? Some(u32(etching.spacers)) : None,
            etching.symbol !== undefined ? Some(etching.symbol) : None,
            etching.terms !== undefined
              ? Some({
                  amount: Some(u128(etching.terms.amount)),
                  cap: Some(u128(etching.terms.cap)),
                  height: [
                    etching.terms.height?.start !== undefined
                      ? Some(u64(etching.terms.height.start))
                      : None,
                    etching.terms.height?.end !== undefined
                      ? Some(u64(etching.terms.height.end))
                      : None,
                  ],
                  offset: [
                    etching.terms.offset?.start !== undefined
                      ? Some(u64(etching.terms.offset.start))
                      : None,
                    etching.terms.offset?.end !== undefined
                      ? Some(u64(etching.terms.offset.end))
                      : None,
                  ],
                })
              : None,
            etching.premine !== undefined ? Some(u128(etching.premine)) : None,
            false
          )
        )
      : None
  )
    .encipher()
    .toString('hex');
}

export const MAGIC_EDEN_OUTPUT = {
  scriptPubKey: {
    hex: 'a914ea6b832a05c6ca578baa3836f3f25553d41068a587',
    address: '3P4WqXDbSLRhzo2H6MT6YFbvBKBDPLbVtQ',
  },
  value: 0,
};
