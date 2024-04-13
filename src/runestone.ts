import { MAGIC_NUMBER, MAX_DIVISIBILITY, MAX_SCRIPT_ELEMENT_SIZE, OP_RETURN } from './constants';
import { Edict } from './edict';
import { Etching } from './etching';
import { SeekBuffer } from './seekbuffer';
import { Tag } from './tag';
import { u128, u32, u64, u8 } from './integer';
import { Option, Some, None } from './monads';
import { Rune } from './rune';
import { Flag } from './flag';
import { Instruction } from './utils';
import { RuneId } from './runeid';
import { script } from './script';
import { Message } from './message';
import { Artifact } from './artifact';
import { Flaw } from './flaw';
import { Cenotaph } from './cenotaph';

export const MAX_SPACERS = 0b00000111_11111111_11111111_11111111;

type RunestoneTx = { vout: { scriptPubKey: { hex: string } }[] };

type Payload = Buffer | Flaw;

export function isValidPayload(payload: Payload): payload is Buffer {
  return Buffer.isBuffer(payload);
}

export class Runestone {
  constructor(
    readonly mint: Option<RuneId>,
    readonly pointer: Option<u32>,
    readonly edicts: Edict[],
    readonly etching: Option<Etching>
  ) {}

  static decipher(transaction: RunestoneTx): Option<Artifact> {
    const optionPayload = Runestone.payload(transaction);
    if (optionPayload.isNone()) {
      return None;
    }
    const payload = optionPayload.unwrap();
    if (!isValidPayload(payload)) {
      return Some(new Cenotaph([payload]));
    }

    const optionIntegers = Runestone.integers(payload);
    if (optionIntegers.isNone()) {
      return Some(new Cenotaph([Flaw.VARINT]));
    }

    const { flaws, edicts, fields } = Message.fromIntegers(
      transaction.vout.length,
      optionIntegers.unwrap()
    );

    let flags = Tag.take(Tag.FLAGS, fields, 1, ([value]) => Some(value)).unwrapOr(u128(0));

    const etchingResult = Flag.take(flags, Flag.ETCHING);
    const etchingFlag = etchingResult.set;
    flags = etchingResult.flags;

    const etching: Option<Etching> = etchingFlag
      ? (() => {
          const divisibility = Tag.take(
            Tag.DIVISIBILITY,
            fields,
            1,
            ([value]): Option<u8> =>
              u128
                .tryIntoU8(value)
                .andThen<u8>((value) => (value <= MAX_DIVISIBILITY ? Some(value) : None))
          );

          const rune = Tag.take(Tag.RUNE, fields, 1, ([value]) => Some(new Rune(value)));

          const spacers = Tag.take(
            Tag.SPACERS,
            fields,
            1,
            ([value]): Option<u32> =>
              u128.tryIntoU32(value).andThen((value) => (value <= MAX_SPACERS ? Some(value) : None))
          );

          const symbol = Tag.take(Tag.SYMBOL, fields, 1, ([value]) =>
            u128.tryIntoU32(value).andThen((value) => {
              try {
                return Some(String.fromCodePoint(Number(value)));
              } catch (e) {
                return None;
              }
            })
          );

          const termsResult = Flag.take(flags, Flag.TERMS);
          const termsFlag = termsResult.set;
          flags = termsResult.flags;

          const terms = termsFlag
            ? (() => {
                const amount = Tag.take(Tag.AMOUNT, fields, 1, ([value]) => Some(value));

                const cap = Tag.take(Tag.CAP, fields, 1, ([value]) => Some(value));

                const offset = [
                  Tag.take(Tag.OFFSET_START, fields, 1, ([value]) => u128.tryIntoU64(value)),
                  Tag.take(Tag.OFFSET_END, fields, 1, ([value]) => u128.tryIntoU64(value)),
                ] as const;

                const height = [
                  Tag.take(Tag.HEIGHT_START, fields, 1, ([value]) => u128.tryIntoU64(value)),
                  Tag.take(Tag.HEIGHT_END, fields, 1, ([value]) => u128.tryIntoU64(value)),
                ] as const;

                return Some({ amount, cap, offset, height });
              })()
            : None;

          const premine = Tag.take(Tag.PREMINE, fields, 1, ([value]) => Some(value));

          const turboResult = Flag.take(flags, Flag.TURBO);
          const turbo = etchingResult.set;
          flags = turboResult.flags;

          return Some(new Etching(divisibility, rune, spacers, symbol, terms, premine, turbo));
        })()
      : None;

    const mint = Tag.take(Tag.MINT, fields, 2, ([block, tx]): Option<RuneId> => {
      const optionBlockU64 = u128.tryIntoU64(block);
      const optionTxU32 = u128.tryIntoU32(tx);

      if (optionBlockU64.isNone() || optionTxU32.isNone()) {
        return None;
      }

      return RuneId.new(optionBlockU64.unwrap(), optionTxU32.unwrap());
    });

    const pointer = Tag.take(
      Tag.POINTER,
      fields,
      1,
      ([value]): Option<u32> =>
        u128
          .tryIntoU32(value)
          .andThen((value) => (value < transaction.vout.length ? Some(value) : None))
    );

    if (etching.map((etching) => etching.supply.isNone()).unwrapOr(false)) {
      flaws.push(Flaw.SUPPLY_OVERFLOW);
    }

    if (flags !== 0n) {
      flaws.push(Flaw.UNRECOGNIZED_FLAG);
    }

    if ([...fields.keys()].find((tag) => tag % 2n === 0n) !== undefined) {
      flaws.push(Flaw.UNRECOGNIZED_EVEN_TAG);
    }

    if (flaws.length !== 0) {
      return Some(
        new Cenotaph(
          flaws,
          etching.andThen((etching) => etching.rune),
          mint
        )
      );
    }

    return Some(new Runestone(mint, pointer, edicts, etching));
  }

  encipher(): Buffer {
    const payloads: Buffer[] = [];

    if (this.etching.isSome()) {
      const etching = this.etching.unwrap();
      let flags = u128(0);
      flags = Flag.set(flags, Flag.ETCHING);

      if (etching.terms.isSome()) {
        flags = Flag.set(flags, Flag.TERMS);
      }

      if (etching.turbo) {
        flags = Flag.set(flags, Flag.TURBO);
      }

      payloads.push(Tag.encode(Tag.FLAGS, [flags]));

      payloads.push(
        Tag.encodeOptionInt(
          Tag.RUNE,
          etching.rune.map((rune) => rune.value)
        )
      );
      payloads.push(Tag.encodeOptionInt(Tag.DIVISIBILITY, etching.divisibility.map(u128)));
      payloads.push(Tag.encodeOptionInt(Tag.SPACERS, etching.spacers.map(u128)));
      payloads.push(
        Tag.encodeOptionInt(
          Tag.SYMBOL,
          etching.symbol.map((symbol) => u128(symbol.codePointAt(0)!))
        )
      );
      payloads.push(Tag.encodeOptionInt(Tag.PREMINE, etching.premine));

      if (etching.terms.isSome()) {
        const terms = etching.terms.unwrap();

        payloads.push(Tag.encodeOptionInt(Tag.AMOUNT, terms.amount));
        payloads.push(Tag.encodeOptionInt(Tag.CAP, terms.cap));
        payloads.push(Tag.encodeOptionInt(Tag.HEIGHT_START, terms.height[0]));
        payloads.push(Tag.encodeOptionInt(Tag.HEIGHT_END, terms.height[1]));
        payloads.push(Tag.encodeOptionInt(Tag.OFFSET_START, terms.offset[0]));
        payloads.push(Tag.encodeOptionInt(Tag.OFFSET_END, terms.offset[1]));
      }
    }

    if (this.mint.isSome()) {
      const claim = this.mint.unwrap();
      payloads.push(Tag.encode(Tag.MINT, [claim.block, claim.tx].map(u128)));
    }

    payloads.push(Tag.encodeOptionInt(Tag.POINTER, this.pointer.map(u128)));

    if (this.edicts.length) {
      payloads.push(u128.encodeVarInt(u128(Tag.BODY)));

      const edicts = [...this.edicts].sort((x, y) =>
        Number(x.id.block - y.id.block || x.id.tx - y.id.tx)
      );

      let previous = new RuneId(u64(0), u32(0));
      for (const edict of edicts) {
        const [block, tx] = previous.delta(edict.id).unwrap();

        payloads.push(u128.encodeVarInt(block));
        payloads.push(u128.encodeVarInt(tx));
        payloads.push(u128.encodeVarInt(edict.amount));
        payloads.push(u128.encodeVarInt(u128(edict.output)));
        previous = edict.id;
      }
    }

    const stack: (Buffer | number)[] = [];
    stack.push(OP_RETURN);
    stack.push(MAGIC_NUMBER);

    const payload = Buffer.concat(payloads);
    let i = 0;
    for (let i = 0; i < payload.length; i += MAX_SCRIPT_ELEMENT_SIZE) {
      stack.push(payload.subarray(i, i + MAX_SCRIPT_ELEMENT_SIZE));
    }

    return script.compile(stack);
  }

  static payload(transaction: RunestoneTx): Option<Payload> {
    // search transaction outputs for payload
    for (const output of transaction.vout) {
      const instructions = script.decompile(Buffer.from(output.scriptPubKey.hex, 'hex'));
      if (instructions === null) {
        throw new Error('unable to decompile');
      }

      // payload starts with OP_RETURN
      let nextInstructionResult = instructions.next();
      if (nextInstructionResult.done || nextInstructionResult.value !== OP_RETURN) {
        continue;
      }

      // followed by the protocol identifier
      nextInstructionResult = instructions.next();
      if (
        nextInstructionResult.done ||
        Instruction.isBuffer(nextInstructionResult.value) ||
        nextInstructionResult.value !== MAGIC_NUMBER
      ) {
        continue;
      }

      // construct the payload by concatinating remaining data pushes
      let payloads: Buffer[] = [];

      do {
        nextInstructionResult = instructions.next();

        if (nextInstructionResult.done) {
          const decodedSuccessfully = nextInstructionResult.value;
          if (!decodedSuccessfully) {
            return Some(Flaw.INVALID_SCRIPT);
          }
          break;
        }

        const instruction = nextInstructionResult.value;
        if (Instruction.isBuffer(instruction)) {
          payloads.push(instruction);
        } else {
          return Some(Flaw.OPCODE);
        }
      } while (true);

      return Some(Buffer.concat(payloads));
    }

    return None;
  }

  static integers(payload: Buffer): Option<u128[]> {
    const integers: u128[] = [];

    const seekBuffer = new SeekBuffer(payload);
    while (!seekBuffer.isFinished()) {
      const optionInt = u128.decodeVarInt(seekBuffer);
      if (optionInt.isNone()) {
        return None;
      }
      integers.push(optionInt.unwrap());
    }

    return Some(integers);
  }
}
