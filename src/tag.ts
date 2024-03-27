import { None, Option, Some } from '@sniptt/monads';
import _ from 'lodash';
import { u128 } from './u128';
import { FixedArray } from './utils';

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
  export function take<N extends number, T>(
    tag: Tag,
    fields: Map<u128, u128[]>,
    n: N,
    withFn: (values: FixedArray<u128, N>) => Option<T>
  ): Option<T> {
    const field = fields.get(u128(tag));
    if (field === undefined) {
      return None;
    }

    const values: u128[] = [];
    for (const i of _.range(n)) {
      if (field[i] === undefined) {
        return None;
      }
      values[i] = field[i];
    }

    const optionValue = withFn(values as FixedArray<u128, N>);
    if (optionValue.isNone()) {
      return None;
    }

    field.splice(0, n);

    if (field.length === 0) {
      fields.delete(u128(tag));
    }

    return Some(optionValue.unwrap());
  }

  export function encode(tag: Tag, values: u128[]): Buffer {
    return Buffer.concat(
      _.flatten(
        values.map((value) => [
          u128.encodeVarInt(u128(tag)),
          u128.encodeVarInt(value),
        ])
      )
    );
  }
}
