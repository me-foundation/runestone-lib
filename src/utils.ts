import * as bitcoin from 'bitcoinjs-lib';

export type Instruction = number | Buffer;

export namespace Instruction {
  export function isNumber(instruction: Instruction): instruction is number {
    return typeof instruction === 'number';
  }

  export function isBuffer(instruction: Instruction): instruction is Buffer {
    return typeof instruction !== 'number';
  }
}

export function decompileScriptAllBuffer(script: Buffer) {
  const instructions = bitcoin.script.decompile(script);
  if (instructions === null) {
    return null;
  }

  const result: Instruction[] = [];
  for (const instruction of instructions) {
    if (Instruction.isNumber(instruction)) {
      switch (instruction) {
        case bitcoin.opcodes.OP_0:
          result.push(Buffer.alloc(0));
          break;
        case bitcoin.opcodes.OP_1:
        case bitcoin.opcodes.OP_2:
        case bitcoin.opcodes.OP_3:
        case bitcoin.opcodes.OP_4:
        case bitcoin.opcodes.OP_5:
        case bitcoin.opcodes.OP_6:
        case bitcoin.opcodes.OP_7:
        case bitcoin.opcodes.OP_8:
        case bitcoin.opcodes.OP_9:
        case bitcoin.opcodes.OP_10:
        case bitcoin.opcodes.OP_11:
        case bitcoin.opcodes.OP_12:
        case bitcoin.opcodes.OP_13:
        case bitcoin.opcodes.OP_14:
        case bitcoin.opcodes.OP_15:
        case bitcoin.opcodes.OP_16:
          result.push(Buffer.from([instruction - bitcoin.opcodes.OP_1 + 1]));
          break;
        case bitcoin.opcodes.OP_1NEGATE:
          result.push(Buffer.from([0x80]));
          break;
        default:
          result.push(instruction);
          break;
      }
    } else {
      result.push(instruction);
    }
  }

  return result;
}
