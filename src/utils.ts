import { script, opcodes } from './script';

export namespace Instruction {
  export function isNumber(instruction: script.Instruction): instruction is number {
    return typeof instruction === 'number';
  }

  export function isBuffer(instruction: script.Instruction): instruction is Buffer {
    return typeof instruction !== 'number';
  }
}

export function tryConvertInstructionToBuffer(instruction: script.Instruction) {
  if (Instruction.isNumber(instruction)) {
    switch (instruction) {
      case opcodes.OP_0:
        return Buffer.alloc(0);
      case opcodes.OP_1:
      case opcodes.OP_2:
      case opcodes.OP_3:
      case opcodes.OP_4:
      case opcodes.OP_5:
      case opcodes.OP_6:
      case opcodes.OP_7:
      case opcodes.OP_8:
      case opcodes.OP_9:
      case opcodes.OP_10:
      case opcodes.OP_11:
      case opcodes.OP_12:
      case opcodes.OP_13:
      case opcodes.OP_14:
      case opcodes.OP_15:
      case opcodes.OP_16:
        return Buffer.from([instruction - opcodes.OP_1 + 1]);
      case opcodes.OP_1NEGATE:
        return Buffer.from([0x80]);
      default:
        return instruction;
    }
  } else {
    return instruction;
  }
}

type GrowToSize<T, N extends number, A extends T[]> = A['length'] extends N
  ? A
  : GrowToSize<T, N, [...A, T]>;

export type FixedArray<T, N extends number> = GrowToSize<T, N, []>;
