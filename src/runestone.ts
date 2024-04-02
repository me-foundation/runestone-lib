import { MAGIC_NUMBER, MAX_DIVISIBILITY, MAX_SCRIPT_ELEMENT_SIZE } from './constants';
import { Edict } from './edict';
import { Etching } from './etching';
import { SeekBuffer } from './seekbuffer';
import { Tag } from './tag';
import { u128, u32, u64, u8 } from './integer';
import * as bitcoin from 'bitcoinjs-lib';
import _ from 'lodash';
import { Option, Some, None } from './monads';
import { Rune } from './rune';
import { Flag } from './flag';
import { Instruction, tryConvertInstructionToBuffer } from './utils';
import { RuneId } from './runeid';

export const MAX_SPACERS = 0b00000111_11111111_11111111_11111111;

type ValidPayload = Buffer;

class InvalidPayload {
  static readonly INSTANCE = new InvalidPayload();
  private constructor() {}
}

type Payload = ValidPayload | InvalidPayload;

export function isValidPayload(payload: Payload): payload is ValidPayload {
  return payload !== InvalidPayload.INSTANCE;
}

export class Runestone {
  constructor(
    readonly cenotaph: boolean,
    readonly mint: Option<RuneId>,
    readonly pointer: Option<u32>,
    readonly edicts: Edict[],
    readonly etching: Option<Etching>
  ) {}

  static fromTransaction(transaction: bitcoin.Transaction): Option<Runestone> {
    try {
      return Runestone.decipher(transaction);
    } catch (e) {
      return None;
    }
  }

  static cenotaph(): Runestone {
    return new Runestone(true, None, None, [], None);
  }

  static decipher(transaction: bitcoin.Transaction): Option<Runestone> {
    const optionPayload = Runestone.payload(transaction);
    if (optionPayload.isNone()) {
      return None;
    }
    const payload = optionPayload.unwrap();
    if (!isValidPayload(payload)) {
      return Some(Runestone.cenotaph());
    }

    const optionIntegers = Runestone.integers(payload);
    if (optionIntegers.isNone()) {
      return Some(Runestone.cenotaph());
    }

    const { cenotaph, edicts, fields } = Message.fromIntegers(transaction, optionIntegers.unwrap());

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
          .andThen((value) => (value < transaction.outs.length ? Some(value) : None))
    );

    const divisibility = Tag.take(
      Tag.DIVISIBILITY,
      fields,
      1,
      ([value]): Option<u8> =>
        u128
          .tryIntoU8(value)
          .andThen<u8>((value) => (value <= MAX_DIVISIBILITY ? Some(value) : None))
    );

    const amount = Tag.take(Tag.AMOUNT, fields, 1, ([value]) => Some(value));

    const rune = Tag.take(Tag.RUNE, fields, 1, ([value]) => Some(new Rune(value)));

    const cap = Tag.take(Tag.CAP, fields, 1, ([value]) => Some(value));

    const premine = Tag.take(Tag.PREMINE, fields, 1, ([value]) => Some(value));

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

    const offset = [
      Tag.take(Tag.OFFSET_START, fields, 1, ([value]) => u128.tryIntoU64(value)),
      Tag.take(Tag.OFFSET_END, fields, 1, ([value]) => u128.tryIntoU64(value)),
    ] as const;

    const height = [
      Tag.take(Tag.HEIGHT_START, fields, 1, ([value]) => u128.tryIntoU64(value)),
      Tag.take(Tag.HEIGHT_END, fields, 1, ([value]) => u128.tryIntoU64(value)),
    ] as const;

    let flags = Tag.take(Tag.FLAGS, fields, 1, ([value]) => Some(value)).unwrapOr(u128(0));

    const etchingResult = Flag.take(flags, Flag.ETCHING);
    const etchingFlag = etchingResult.set;
    flags = etchingResult.flags;

    const termsResult = Flag.take(flags, Flag.TERMS);
    const terms = termsResult.set;
    flags = termsResult.flags;

    const overflow = (() => {
      const premineU128 = premine.unwrapOr(u128(0));
      const capU128 = cap.unwrapOr(u128(0));
      const amountU128 = amount.unwrapOr(u128(0));

      const multiplyResult = u128.checkedMultiply(capU128, amountU128);
      if (multiplyResult.isNone()) {
        return None;
      }
      return u128.checkedAdd(premineU128, multiplyResult.unwrap());
    })().isNone();

    let etching: Option<Etching> = etchingFlag
      ? Some(
          new Etching(
            divisibility,
            rune,
            spacers,
            symbol,
            terms
              ? Some({
                  amount,
                  cap,
                  offset,
                  height,
                })
              : None,
            premine
          )
        )
      : None;

    return Some(
      new Runestone(
        cenotaph ||
          overflow ||
          flags !== 0n ||
          [...fields.keys()].find((tag) => tag % 2n === 0n) !== undefined,
        mint,
        pointer,
        edicts,
        etching
      )
    );
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

    if (this.cenotaph) {
      payloads.push(Tag.encode(Tag.CENOTAPH, [u128(0)]));
    }

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

    const stack: bitcoin.Stack = [];
    stack.push(bitcoin.opcodes.OP_RETURN);
    stack.push(MAGIC_NUMBER);

    const payload = Buffer.concat(payloads);
    let i = 0;
    for (let i = 0; i < payload.length; i += MAX_SCRIPT_ELEMENT_SIZE) {
      stack.push(payload.subarray(i, i + MAX_SCRIPT_ELEMENT_SIZE));
    }

    return bitcoin.script.compile(stack);
  }

  static payload(transaction: bitcoin.Transaction): Option<Payload> {
    // search transaction outputs for payload
    for (const output of transaction.outs) {
      const instructions = bitcoin.script.decompile(output.script);
      if (instructions === null) {
        throw new Error('unable to decompile');
      }

      // payload starts with OP_RETURN
      let nextInstruction: Instruction | undefined = instructions.shift();
      if (nextInstruction !== bitcoin.opcodes.OP_RETURN) {
        continue;
      }

      // followed by the protocol identifier
      nextInstruction = instructions.shift();
      if (
        !nextInstruction ||
        Instruction.isBuffer(nextInstruction) ||
        nextInstruction !== MAGIC_NUMBER
      ) {
        continue;
      }

      // construct the payload by concatinating remaining data pushes
      let payloads: Buffer[] = [];

      for (const instruction of instructions) {
        const result = tryConvertInstructionToBuffer(instruction);
        if (Instruction.isBuffer(result)) {
          payloads.push(result);
        } else {
          return Some(InvalidPayload.INSTANCE);
        }
      }

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

export class Message {
  constructor(
    readonly cenotaph: boolean,
    readonly edicts: Edict[],
    readonly fields: Map<u128, u128[]>
  ) {}

  static fromIntegers(tx: bitcoin.Transaction, payload: u128[]): Message {
    const edicts: Edict[] = [];
    const fields = new Map<u128, u128[]>();
    let cenotaph = false;

    for (const i of [...Array(Math.ceil(payload.length / 2)).keys()].map((n) => n * 2)) {
      const tag = payload[i];

      if (u128(Tag.BODY) === tag) {
        let id = new RuneId(u64(0), u32(0));
        const chunkSize = 4;

        const body = payload.slice(i + 1);
        for (let j = 0; j < body.length; j += chunkSize) {
          const chunk = body.slice(j, j + chunkSize);
          if (chunk.length !== chunkSize) {
            cenotaph = true;
            break;
          }

          const optionNext = id.next(chunk[0], chunk[1]);
          if (optionNext.isNone()) {
            cenotaph = true;
            break;
          }
          const next = optionNext.unwrap();

          const optionEdict = Edict.fromIntegers(tx, next, chunk[2], chunk[3]);
          if (optionEdict.isNone()) {
            cenotaph = true;
            break;
          }
          const edict = optionEdict.unwrap();

          id = next;
          edicts.push(edict);
        }
        break;
      }

      const value = payload[i + 1];
      if (value === undefined) {
        cenotaph = true;
        break;
      }

      const values = fields.get(tag) ?? [];
      values.push(value);
      fields.set(tag, values);
    }

    return new Message(cenotaph, edicts, fields);
  }
}
