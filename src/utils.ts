import { script, opcodes } from './script';

export namespace Instruction {
  export function isNumber(instruction: script.Instruction): instruction is number {
    return typeof instruction === 'number';
  }

  export function isBuffer(instruction: script.Instruction): instruction is Buffer {
    return typeof instruction !== 'number';
  }
}

type GrowToSize<T, N extends number, A extends T[]> = A['length'] extends N
  ? A
  : GrowToSize<T, N, [...A, T]>;

export type FixedArray<T, N extends number> = GrowToSize<T, N, []>;
