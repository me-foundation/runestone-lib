import { None, Option, Some } from '@sniptt/monads';
import { u128 } from './u128';

export enum Tag {
  BODY = 0,
  FLAGS = 2,
  RUNE = 4,
  LIMIT = 6,
  TERM = 8,
  DEADLINE = 10,
  DEFAULT_OUTPUT = 12,
  CLAIM = 14,
  CENOTAPH = 126,

  DIVISIBILITY = 1,
  SPACERS = 3,
  SYMBOL = 5,
  NOP = 127,
}

export namespace Tag {
  export function take(fields: Map<u128, u128>, tag: Tag): Option<u128> {
    const key = u128(tag);
    const value = fields.get(key);
    fields.delete(key);
    return value ? Some(value) : None;
  }

  export function encode(tag: Tag, value: u128): Buffer {
    return Buffer.concat([
      u128.encodeVarInt(u128(tag)),
      u128.encodeVarInt(value),
    ]);
  }
}
