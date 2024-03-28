import {
  MAGIC_NUMBER,
  MAX_DIVISIBILITY,
  MAX_LIMIT,
  MAX_SCRIPT_ELEMENT_SIZE,
} from './constants';
import { Edict } from './edict';
import { Etching } from './etching';
import { SeekBuffer } from './seekbuffer';
import { Tag } from './tag';
import { U32_MAX, u128 } from './u128';
import * as bitcoin from 'bitcoinjs-lib';
import _ from 'lodash';
import { Option, Some, None } from '@sniptt/monads';
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
    readonly claim: Option<RuneId>,
    readonly defaultOutput: Option<number>,
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

    const { cenotaph, edicts, fields } = Message.fromIntegers(
      transaction,
      optionIntegers.unwrap()
    );

    const claim = Tag.take(
      Tag.CLAIM,
      fields,
      2,
      ([block, tx]): Option<RuneId> =>
        block <= u128(U32_MAX) && tx <= u128(U32_MAX)
          ? RuneId.new(Number(block), Number(tx))
          : None
    );

    const deadline = Tag.take(
      Tag.DEADLINE,
      fields,
      1,
      ([value]): Option<number> =>
        value <= u128(U32_MAX) ? Some(Number(value)) : None
    );

    const defaultOutput = Tag.take(
      Tag.DEFAULT_OUTPUT,
      fields,
      1,
      ([value]): Option<number> =>
        value <= u128(U32_MAX) && Number(value) < transaction.outs.length
          ? Some(Number(value))
          : None
    );

    const divisibility = Tag.take(
      Tag.DIVISIBILITY,
      fields,
      1,
      ([value]): Option<number> =>
        value <= 0xffn && Number(value) <= MAX_DIVISIBILITY
          ? Some(Number(value))
          : None
    );

    const limit = Tag.take(Tag.LIMIT, fields, 1, ([value]) => Some(value));

    const rune = Tag.take(Tag.RUNE, fields, 1, ([value]) =>
      Some(new Rune(value))
    );

    const cap = Tag.take(Tag.CAP, fields, 1, ([value]) => Some(value));

    const premine = Tag.take(Tag.PREMINE, fields, 1, ([value]) => Some(value));

    const spacers = Tag.take(
      Tag.SPACERS,
      fields,
      1,
      ([value]): Option<number> =>
        value <= u128(U32_MAX) && Number(value) <= MAX_SPACERS
          ? Some(Number(value))
          : None
    );

    const symbol = Tag.take(Tag.SYMBOL, fields, 1, ([value]) => {
      if (value > u128(U32_MAX)) {
        return None;
      }

      try {
        return Some(String.fromCodePoint(Number(value)));
      } catch (e) {
        return None;
      }
    });

    const term = Tag.take(Tag.TERM, fields, 1, ([value]) =>
      value <= U32_MAX ? Some(Number(value)) : None
    );

    let flags = Tag.take(Tag.FLAGS, fields, 1, ([value]) =>
      Some(value)
    ).unwrapOr(u128(0));

    const etchResult = Flag.take(flags, Flag.ETCH);
    const etch = etchResult.set;
    flags = etchResult.flags;

    const mintResult = Flag.take(flags, Flag.MINT);
    const mint = mintResult.set;
    flags = mintResult.flags;

    const overflow = (() => {
      const premineU128 = premine.unwrapOr(u128(0));
      const capU128 = cap.unwrapOr(u128(0));
      const limitU128 = limit.unwrapOr(u128(0));

      const multiplyResult = u128.checkedMultiply(capU128, limitU128);
      if (multiplyResult.isNone()) {
        return None;
      }
      return u128.checkedAdd(premineU128, multiplyResult.unwrap());
    })().isNone();

    let etching: Option<Etching> = etch
      ? Some(
          new Etching(
            divisibility,
            rune,
            spacers,
            symbol,
            mint
              ? Some({
                  cap,
                  deadline,
                  limit,
                  term,
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
        claim,
        defaultOutput,
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
      flags = Flag.set(flags, Flag.ETCH);

      if (etching.mint.isSome()) {
        flags = Flag.set(flags, Flag.MINT);
      }

      payloads.push(Tag.encode(Tag.FLAGS, [flags]));

      if (etching.rune.isSome()) {
        const rune = etching.rune.unwrap();
        payloads.push(Tag.encode(Tag.RUNE, [rune.value]));
      }

      if (etching.divisibility.isSome()) {
        payloads.push(
          Tag.encode(Tag.DIVISIBILITY, [u128(etching.divisibility.unwrap())])
        );
      }

      if (etching.spacers.isSome()) {
        payloads.push(
          Tag.encode(Tag.SPACERS, [u128(etching.spacers.unwrap())])
        );
      }

      if (etching.symbol.isSome()) {
        const symbol = etching.symbol.unwrap();
        payloads.push(Tag.encode(Tag.SYMBOL, [u128(symbol.codePointAt(0)!)]));
      }

      if (etching.premine.isSome()) {
        const premine = etching.premine.unwrap();
        payloads.push(Tag.encode(Tag.SYMBOL, [premine]));
      }

      if (etching.mint.isSome()) {
        const mint = etching.mint.unwrap();

        if (mint.deadline.isSome()) {
          const deadline = mint.deadline.unwrap();
          payloads.push(Tag.encode(Tag.DEADLINE, [u128(deadline)]));
        }

        if (mint.limit.isSome()) {
          const limit = mint.limit.unwrap();
          payloads.push(Tag.encode(Tag.LIMIT, [limit]));
        }

        if (mint.term.isSome()) {
          const term = mint.term.unwrap();
          payloads.push(Tag.encode(Tag.TERM, [u128(term)]));
        }

        if (mint.cap.isSome()) {
          const cap = mint.cap.unwrap();
          payloads.push(Tag.encode(Tag.CAP, [cap]));
        }
      }
    }

    if (this.claim.isSome()) {
      const claim = this.claim.unwrap();
      payloads.push(Tag.encode(Tag.CLAIM, [claim.block, claim.tx].map(u128)));
    }

    if (this.defaultOutput.isSome()) {
      const defaultOutput = this.defaultOutput.unwrap();
      payloads.push(Tag.encode(Tag.DEFAULT_OUTPUT, [u128(defaultOutput)]));
    }

    if (this.cenotaph) {
      payloads.push(Tag.encode(Tag.CENOTAPH, [u128(0)]));
    }

    if (this.edicts.length) {
      payloads.push(u128.encodeVarInt(u128(Tag.BODY)));

      const edicts = _.sortBy(this.edicts, (edict) => edict.id);

      let previous = new RuneId(0, 0);
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

    for (const i of _.range(0, payload.length, 2)) {
      const tag = payload[i];

      if (u128(Tag.BODY) === tag) {
        let id = new RuneId(0, 0);
        for (const chunk of _.chunk(payload.slice(i + 1), 4)) {
          if (chunk.length !== 4) {
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
