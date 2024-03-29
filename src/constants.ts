import * as bitcoin from 'bitcoinjs-lib';
import { u128, u8 } from './integer';

export const MAX_DIVISIBILITY = u8(38);
export const RESERVED = u128(6402364363415443603228541259936211926n);
export const SUBSIDY_HALVING_INTERVAL = 210_000;
export const MAX_SCRIPT_ELEMENT_SIZE = 520;
export const MAGIC_NUMBER = bitcoin.opcodes.OP_13;
