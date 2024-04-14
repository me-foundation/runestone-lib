import { MAX_DIVISIBILITY } from './src/constants';
import { Etching } from './src/etching';
import { RuneEtchingSpec } from './src/indexer';
import { u128, u32, u64, u8 } from './src/integer';
import { None, Option, Some } from './src/monads';
import { Rune } from './src/rune';
import { RuneId } from './src/runeid';
import { Runestone } from './src/runestone';
import { SpacedRune } from './src/spacedrune';
import { Terms } from './src/terms';

export {
  BlockIdentifier,
  BlockInfo,
  RuneBalance,
  RuneBlockIndex,
  RuneEtching,
  RuneEtchingSpec,
  RuneLocation,
  RuneMintCount,
  RuneOutput,
  RuneUtxoBalance,
  RunestoneIndexer,
  RunestoneIndexerOptions,
  RunestoneStorage,
} from './src/indexer';

export { Edict } from './src/edict';
export { Etching } from './src/etching';
export { Network } from './src/network';
export { Rune } from './src/rune';
export { SpacedRune } from './src/spacedrune';
export { RuneId } from './src/runeid';
export { Runestone } from './src/runestone';
export { Terms } from './src/terms';

export {
  BitcoinRpcClient,
  GetBlockParams,
  GetBlockReturn,
  GetRawTransactionParams,
  GetRawTransactionReturn,
  RpcResponse,
  Tx,
} from './src/rpcclient';

export type RunestoneSpec = {
  mint?: {
    block: bigint;
    tx: number;
  };
  pointer?: number;
  etching?: RuneEtchingSpec;
  edicts?: {
    id: {
      block: bigint;
      tx: number;
    };
    amount: bigint;
    output: number;
  }[];
};

// Helper functions to ensure numbers fit the desired type correctly
const u8Strict = (n: number) => {
  const bigN = BigInt(n);
  if (bigN < 0n || bigN > u8.MAX) {
    throw Error('u8 overflow');
  }
  return u8(bigN);
};
const u32Strict = (n: number) => {
  const bigN = BigInt(n);
  if (bigN < 0n || bigN > u32.MAX) {
    throw Error('u32 overflow');
  }
  return u32(bigN);
};
const u64Strict = (n: bigint) => {
  const bigN = BigInt(n);
  if (bigN < 0n || bigN > u64.MAX) {
    throw Error('u64 overflow');
  }
  return u64(bigN);
};
const u128Strict = (n: bigint) => {
  const bigN = BigInt(n);
  if (bigN < 0n || bigN > u128.MAX) {
    throw Error('u128 overflow');
  }
  return u128(bigN);
};

const SPACERS = ['•', '.'];

// TODO: Add unit tests
/**
 * Low level function to allow for encoding runestones without any indexer and transaction checks.
 *
 * @param runestone runestone spec to encode as runestone
 * @returns encoded runestone bytes
 * @throws Error if encoding is detected to be considered a cenotaph
 */
export function encodeRunestoneUnsafe(runestone: RunestoneSpec): {
  encodedRune: Buffer;
  etchingCommitment: Buffer | undefined;
} {
  const mint = runestone.mint
    ? Some(new RuneId(u64Strict(runestone.mint.block), u32Strict(runestone.mint.tx)))
    : None;

  const pointer = runestone.pointer !== undefined ? Some(runestone.pointer).map(u32Strict) : None;

  const edicts = (runestone.edicts ?? []).map((edict) => ({
    id: new RuneId(u64Strict(edict.id.block), u32Strict(edict.id.tx)),
    amount: u128Strict(edict.amount),
    output: u32Strict(edict.output),
  }));

  let etching: Option<Etching> = None;
  let etchingCommitment: string | undefined = undefined;
  if (runestone.etching) {
    const etchingSpec = runestone.etching;
    let hasSpacers = false;
    for (const spacer of SPACERS) {
      if (runestone.etching?.rune?.includes(spacer)) {
        hasSpacers = true;
        break;
      }
    }

    let runeSpacers: number | undefined = undefined;
    let parsedRawRune: Rune | undefined = undefined;
    if (hasSpacers) {
      const spacedRune = etchingSpec.rune ? SpacedRune.fromString(etchingSpec.rune) : undefined;
      runeSpacers = spacedRune?.spacers;
      parsedRawRune = spacedRune?.rune;
    } else {
      parsedRawRune = etchingSpec.rune ? Rune.fromString(etchingSpec.rune) : undefined;
    }
    const rune: Option<Rune> =
      parsedRawRune !== undefined ? Some(parsedRawRune).map(() => parsedRawRune!) : None;

    if (etchingSpec.symbol && etchingSpec.symbol.codePointAt(1) !== undefined) {
      throw Error('Symbol must be one code point');
    }

    const divisibility =
      etchingSpec.divisibility !== undefined ? Some(etchingSpec.divisibility).map(u8Strict) : None;
    const premine =
      etchingSpec.premine !== undefined ? Some(etchingSpec.premine).map(u128Strict) : None;
    const spacers: Option<u32> = hasSpacers && runeSpacers ? Some(u32Strict(runeSpacers)) : None;
    const symbol = etchingSpec.symbol ? Some(etchingSpec.symbol) : None;

    if (divisibility.isSome() && divisibility.unwrap() > MAX_DIVISIBILITY) {
      throw Error(`Divisibility is greater than protocol max ${MAX_DIVISIBILITY}`);
    }

    let terms: Option<Terms> = None;
    if (etchingSpec.terms) {
      const termsSpec = etchingSpec.terms;

      const amount = termsSpec.amount !== undefined ? Some(termsSpec.amount).map(u128Strict) : None;
      const cap = termsSpec.cap !== undefined ? Some(termsSpec.cap).map(u128Strict) : None;
      const height: [Option<u64>, Option<u64>] = termsSpec.height
        ? [
            termsSpec.height.start !== undefined
              ? Some(termsSpec.height.start).map(u64Strict)
              : None,
            termsSpec.height.end !== undefined ? Some(termsSpec.height.end).map(u64Strict) : None,
          ]
        : [None, None];
      const offset: [Option<u64>, Option<u64>] = termsSpec.offset
        ? [
            termsSpec.offset.start !== undefined
              ? Some(termsSpec.offset.start).map(u64Strict)
              : None,
            termsSpec.offset.end !== undefined ? Some(termsSpec.offset.end).map(u64Strict) : None,
          ]
        : [None, None];

      if (amount.isSome() && cap.isSome() && amount.unwrap() * cap.unwrap() > u128.MAX) {
        throw Error('Terms overflow with amount times cap');
      }

      terms = Some({ amount, cap, height, offset });
    }

    const turbo = etchingSpec.turbo ?? false;

    etching = Some(new Etching(divisibility, rune, spacers, symbol, terms, premine, turbo));
    etchingCommitment = (parsedRawRune as Rune)?.commitment;
  }

  return {
    encodedRune: new Runestone(mint, pointer, edicts, etching).encipher(),
    etchingCommitment,
  };
}
