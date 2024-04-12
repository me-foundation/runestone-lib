import { u128, u8 } from './integer';
import { opcodes } from './script';

export const MAX_DIVISIBILITY = u8(38);
export const RESERVED = u128(6402364363415443603228541259936211926n);
export const SUBSIDY_HALVING_INTERVAL = 210_000;
export const MAX_SCRIPT_ELEMENT_SIZE = 520;

export const OP_RETURN = opcodes.OP_RETURN;
export const MAGIC_NUMBER = opcodes.OP_13;

export const TAPROOT_ANNEX_PREFIX = 0x50;
export const COMMIT_INTERVAL = 6;

export const TAPROOT_SCRIPT_PUBKEY_TYPE = 'witness_v1_taproot';
