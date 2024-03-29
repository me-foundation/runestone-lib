import * as bitcoin from 'bitcoinjs-lib';
import _ from 'lodash';
import { MAX_SPACERS, Runestone, isValidPayload } from '../src/runestone';
import { u128, u32, u64, u8 } from '../src/integer';
import { None, Option, Some } from '@sniptt/monads';
import { Tag } from '../src/tag';
import { Flag } from '../src/flag';
import { MAGIC_NUMBER, MAX_DIVISIBILITY } from '../src/constants';
import { Rune } from '../src/rune';
import { SpacedRune } from '../src/spacedrune';
import { Edict } from '../src/edict';
import { Etching } from '../src/etching';
import { RuneId } from '../src/runeid';

function createRuneId(tx: number) {
  return new RuneId(u64(1), u32(tx));
}

describe('runestone', () => {
  function decipher(integers: u128[]): Runestone {
    return Runestone.decipher(
      getSimpleTransaction([bitcoin.opcodes.OP_RETURN, MAGIC_NUMBER, getPayload(integers)])
    ).unwrap();
  }

  function getPayload(integers: u128[]) {
    const payloads: Buffer[] = [];

    for (const integer of integers) {
      payloads.push(u128.encodeVarInt(integer));
    }

    return Buffer.concat(payloads);
  }

  function getSimpleTransaction(stack: bitcoin.Stack): bitcoin.Transaction {
    const transaction = new bitcoin.Transaction();
    transaction.addOutput(bitcoin.script.compile(stack), 0);
    return transaction;
  }

  test('from_transaction_returns_none_if_decipher_returns_error', () => {
    expect(
      Runestone.fromTransaction(getSimpleTransaction([bitcoin.opcodes.OP_PUSHBYTES_4])).isNone()
    ).toBe(true);
  });

  test('deciphering_transaction_with_no_outputs_returns_none', () => {
    expect(Runestone.decipher(new bitcoin.Transaction()).isNone()).toBe(true);
  });

  test('deciphering_transaction_with_non_op_return_output_returns_none', () => {
    expect(Runestone.decipher(getSimpleTransaction([Buffer.alloc(0)])).isNone()).toBe(true);
  });

  test('deciphering_transaction_with_bare_op_return_returns_none', () => {
    expect(Runestone.decipher(getSimpleTransaction([bitcoin.opcodes.OP_RETURN])).isNone()).toBe(
      true
    );
  });

  test('deciphering_transaction_with_non_matching_op_return_returns_none', () => {
    expect(
      Runestone.decipher(
        getSimpleTransaction([bitcoin.opcodes.OP_RETURN, Buffer.from('FOOO')])
      ).isNone()
    ).toBe(true);
  });

  test('deciphering_valid_runestone_with_invalid_script_returns_script_error', () => {
    expect(
      Runestone.decipher(getSimpleTransaction([bitcoin.opcodes.OP_PUSHBYTES_4])).isNone()
    ).toBe(true);
  });

  test('deciphering_valid_runestone_with_invalid_script_postfix_returns_script_error', () => {
    const transaction = getSimpleTransaction([bitcoin.opcodes.OP_RETURN, MAGIC_NUMBER]);

    transaction.outs[0].script = Buffer.concat([transaction.outs[0].script, Buffer.from([4])]);

    expect(() => Runestone.decipher(transaction)).toThrow();
  });

  test('deciphering_runestone_with_truncated_varint_succeeds', () => {
    expect(
      Runestone.decipher(
        getSimpleTransaction([bitcoin.opcodes.OP_RETURN, MAGIC_NUMBER, Buffer.from([128])])
      ).isSome()
    ).toBe(true);
  });

  test('outputs_with_non_pushdata_opcodes_are_cenotaph', () => {
    const transaction = new bitcoin.Transaction();
    transaction.addOutput(
      bitcoin.script.compile([
        bitcoin.opcodes.OP_RETURN,
        MAGIC_NUMBER,
        bitcoin.opcodes.OP_VERIFY,
        Buffer.from([0]),
        u128.encodeVarInt(u128(1)),
        u128.encodeVarInt(u128(1)),
        Buffer.from([2, 0]),
      ]),
      0
    );
    transaction.addOutput(
      bitcoin.script.compile([
        bitcoin.opcodes.OP_RETURN,
        MAGIC_NUMBER,
        Buffer.from([0]),
        u128.encodeVarInt(u128(1)),
        u128.encodeVarInt(u128(1)),
        Buffer.from([3, 0]),
      ]),
      0
    );

    expect(Runestone.decipher(transaction).unwrap()).toMatchObject({
      cenotaph: true,
    });
  });

  test('deciphering_empty_runestone_is_successful', () => {
    expect(
      Runestone.decipher(getSimpleTransaction([bitcoin.opcodes.OP_RETURN, MAGIC_NUMBER])).isSome()
    ).toBe(true);
  });

  test('error_in_input_aborts_search_for_runestone', () => {
    const payload = getPayload([0, 1, 2, 3].map(u128));

    const transaction = new bitcoin.Transaction();
    let scriptPubKey = bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, MAGIC_NUMBER, 4]);
    scriptPubKey = Buffer.concat([scriptPubKey, Buffer.from([4])]);
    transaction.addOutput(bitcoin.script.compile(scriptPubKey), 0);
    transaction.addOutput(
      bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, MAGIC_NUMBER, payload]),
      0
    );

    expect(() => Runestone.decipher(transaction)).toThrow();
  });

  test('deciphering_non_empty_runestone_is_successful', () => {
    expect(decipher([Tag.BODY, 1, 1, 2, 0].map(u128))).toMatchObject({
      edicts: [{ id: createRuneId(1), amount: 2n, output: 0n }],
    });
  });

  test('decipher_etching', () => {
    const runestone = decipher(
      [Tag.FLAGS, Flag.mask(Flag.ETCHING), Tag.BODY, 1, 1, 2, 0].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility.isNone()).toBe(true);
    expect(etching.rune.isNone()).toBe(true);
    expect(etching.spacers.isNone()).toBe(true);
    expect(etching.symbol.isNone()).toBe(true);
    expect(etching.terms.isNone()).toBe(true);
  });

  test('decipher_etching_with_rune', () => {
    const runestone = decipher(
      [Tag.FLAGS, Flag.mask(Flag.ETCHING), Tag.RUNE, 4, Tag.BODY, 1, 1, 2, 0].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility.isNone()).toBe(true);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers.isNone()).toBe(true);
    expect(etching.symbol.isNone()).toBe(true);
    expect(etching.terms.isNone()).toBe(true);
  });

  test('etch_flag_is_required_to_etch_rune_even_if_mint_is_set', () => {
    const runestone = decipher(
      [Tag.FLAGS, Flag.mask(Flag.TERMS), Tag.OFFSET_END, 4, Tag.BODY, 1, 1, 2, 0].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);
    expect(runestone.etching.isNone()).toBe(true);
  });

  test('decipher_etching_with_term', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCHING) | Flag.mask(Flag.TERMS),
        Tag.OFFSET_END,
        4,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility.isNone()).toBe(true);
    expect(etching.rune.isNone()).toBe(true);
    expect(etching.spacers.isNone()).toBe(true);
    expect(etching.symbol.isNone()).toBe(true);

    const mint = etching.terms.unwrap();
    expect(mint.offset[0].isNone()).toBe(true);
    expect(mint.offset[1].unwrap()).toBe(4n);
    expect(mint.height[0].isNone()).toBe(true);
    expect(mint.height[1].isNone()).toBe(true);
    expect(mint.limit.isNone()).toBe(true);
    expect(mint.cap.isNone()).toBe(true);
  });

  test('decipher_etching_with_limit', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCHING) | Flag.mask(Flag.TERMS),
        Tag.LIMIT,
        4,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility.isNone()).toBe(true);
    expect(etching.rune.isNone()).toBe(true);
    expect(etching.spacers.isNone()).toBe(true);
    expect(etching.symbol.isNone()).toBe(true);

    const mint = etching.terms.unwrap();
    expect(mint.offset[0].isNone()).toBe(true);
    expect(mint.offset[1].isNone()).toBe(true);
    expect(mint.height[0].isNone()).toBe(true);
    expect(mint.height[1].isNone()).toBe(true);
    expect(mint.cap.isNone()).toBe(true);
    expect(mint.limit.unwrap()).toBe(4n);
  });

  test('invalid_varint_produces_cenotaph', () => {
    expect(
      Runestone.decipher(
        getSimpleTransaction([bitcoin.opcodes.OP_RETURN, MAGIC_NUMBER, Buffer.from([128])])
      ).unwrap()
    ).toMatchObject({ cenotaph: true });
  });

  test('duplicate_even_tags_produce_cenotaph', () => {
    const runestone = decipher(
      [Tag.FLAGS, Flag.mask(Flag.ETCHING), Tag.RUNE, 4, Tag.RUNE, 5, Tag.BODY, 1, 1, 2, 0].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);
    expect(runestone.cenotaph).toBe(true);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility.isNone()).toBe(true);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers.isNone()).toBe(true);
    expect(etching.symbol.isNone()).toBe(true);
    expect(etching.terms.isNone()).toBe(true);
  });

  test('duplicate_odd_tags_are_ignored', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCHING),
        Tag.DIVISIBILITY,
        4,
        Tag.DIVISIBILITY,
        5,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);
    expect(runestone.etching.unwrap().divisibility.unwrap()).toBe(4n);
  });

  test('runestone_with_unrecognized_even_tag_is_cenotaph', () => {
    const runestone = decipher([Tag.CENOTAPH, 0, Tag.BODY, 1, 1, 2, 0].map(u128));

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);
    expect(runestone.cenotaph).toBe(true);
  });

  test('runestone_with_unrecognized_flag_is_cenotaph', () => {
    const runestone = decipher(
      [Tag.FLAGS, Flag.mask(Flag.CENOTAPH), Tag.BODY, 1, 1, 2, 0].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);
    expect(runestone.cenotaph).toBe(true);
  });

  test('runestone_with_edict_id_with_zero_block_and_nonzero_tx_is_cenotaph', () => {
    const runestone = decipher([Tag.BODY, 0, 1, 2, 0].map(u128));

    expect(runestone.edicts).toEqual([]);
    expect(runestone.cenotaph).toBe(true);
  });

  test('runestone_with_output_over_max_is_cenotaph', () => {
    const runestone = decipher([Tag.BODY, 1, 1, 2, 2].map(u128));

    expect(runestone.edicts).toEqual([]);
    expect(runestone.cenotaph).toBe(true);
  });

  test('tag_with_no_value_is_ignored', () => {
    const runestone = decipher([Tag.FLAGS, 1, Tag.BODY, Tag.FLAGS].map(u128));

    expect(runestone.etching.isSome()).toBe(true);
  });

  test('trailing_integers_in_body_is_cenotaph', () => {
    const integers = [Tag.BODY, 1, 1, 2, 0];

    for (const i of _.range(4)) {
      const runestone = decipher(integers.map(u128));
      if (i === 0) {
        expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);
        expect(runestone.cenotaph).toBe(false);
      } else {
        expect(runestone.cenotaph).toBe(true);
      }

      integers.push(0);
    }
  });

  test('decipher_etching_with_divisibility', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCHING),
        Tag.RUNE,
        4,
        Tag.DIVISIBILITY,
        5,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility.unwrap()).toBe(5n);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers.isNone()).toBe(true);
    expect(etching.symbol.isNone()).toBe(true);
    expect(etching.terms.isNone()).toBe(true);
  });

  test('divisibility_above_max_is_ignored', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCHING),
        Tag.RUNE,
        4,
        Tag.DIVISIBILITY,
        u128(MAX_DIVISIBILITY + 1n),
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility.isNone()).toBe(true);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers.isNone()).toBe(true);
    expect(etching.symbol.isNone()).toBe(true);
    expect(etching.terms.isNone()).toBe(true);
  });

  test('symbol_above_max_is_ignored', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCHING),
        Tag.RUNE,
        4,
        Tag.SYMBOL,
        0x110000,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility.isNone()).toBe(true);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers.isNone()).toBe(true);
    expect(etching.symbol.isNone()).toBe(true);
    expect(etching.terms.isNone()).toBe(true);
  });

  test('decipher_etching_with_symbol', () => {
    const runestone = decipher(
      [Tag.FLAGS, Flag.mask(Flag.ETCHING), Tag.RUNE, 4, Tag.SYMBOL, 97, Tag.BODY, 1, 1, 2, 0].map(
        u128
      )
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility.isNone()).toBe(true);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers.isNone()).toBe(true);
    expect(etching.symbol.unwrap()).toBe('a');
    expect(etching.terms.isNone()).toBe(true);
  });

  test('decipher_etching_with_all_etching_tags', () => {
    //       Tag::Flags.into(),
    //       Flag::Etching.mask() | Flag::Terms.mask(),
    //       Tag::Rune.into(),
    //       4,

    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCHING) | Flag.mask(Flag.TERMS),
        Tag.RUNE,
        4,
        Tag.DIVISIBILITY,
        1,
        Tag.SPACERS,
        5,
        Tag.SYMBOL,
        'a'.codePointAt(0)!,
        Tag.OFFSET_END,
        2,
        Tag.LIMIT,
        3,
        Tag.PREMINE,
        8,
        Tag.CAP,
        9,
        Tag.POINTER,
        0,
        Tag.MINT,
        1,
        Tag.MINT,
        1,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);
    expect(runestone.cenotaph).toBe(false);
    expect(runestone.pointer.unwrap()).toBe(0n);
    expect(runestone.mint.unwrap()).toEqual(new RuneId(u64(1), u32(1)));

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility.unwrap()).toBe(1n);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers.unwrap()).toBe(5n);
    expect(etching.symbol.unwrap()).toBe('a');
    expect(etching.premine.unwrap()).toBe(8n);

    const mint = etching.terms.unwrap();
    expect(mint.offset[0].isNone()).toBe(true);
    expect(mint.offset[1].unwrap()).toBe(2n);
    expect(mint.limit.unwrap()).toBe(3n);
    expect(mint.height[0].isNone()).toBe(true);
    expect(mint.height[1].isNone()).toBe(true);
    expect(mint.cap.unwrap()).toBe(9n);
  });

  // fn decipher_etching_with_all_etching_tags() {
  //   pretty_assert_eq!(
  //     decipher(&[
  //       Tag::Flags.into(),
  //       Flag::Etching.mask() | Flag::Terms.mask(),
  //       Tag::Rune.into(),
  //       4,
  //       Tag::Divisibility.into(),
  //       1,
  //       Tag::Spacers.into(),
  //       5,
  //       Tag::Symbol.into(),
  //       'a'.into(),
  //       Tag::OffsetEnd.into(),
  //       2,
  //       Tag::Amount.into(),
  //       3,
  //       Tag::Premine.into(),
  //       8,
  //       Tag::Cap.into(),
  //       9,
  //       Tag::Pointer.into(),
  //       0,
  //       Tag::Mint.into(),
  //       1,
  //       Tag::Mint.into(),
  //       1,
  //       Tag::Body.into(),
  //       1,
  //       1,
  //       2,
  //       0,
  //     ]),
  //     Runestone {
  //       edicts: vec![Edict {
  //         id: rune_id(1),
  //         amount: 2,
  //         output: 0n,
  //       }],
  //       etching: Some(Etching {
  //         rune: Some(Rune(4)),
  //         terms: Some(Terms {
  //           cap: Some(9),
  //           offset: (None, Some(2)),
  //           amount: Some(3),
  //           height: (None, None),
  //         }),
  //         premine: Some(8),
  //         divisibility: Some(1),
  //         symbol: Some('a'),
  //         spacers: Some(5),
  //       }),
  //       cenotaph: false,
  //       pointer: Some(0),
  //       mint: Some(RuneId::new(1, 1).unwrap()),
  //     },
  //   );
  // }

  test('recognized_even_etching_fields_in_non_etching_are_ignored', () => {
    const runestone = decipher(
      [
        Tag.RUNE,
        4,
        Tag.DIVISIBILITY,
        1,
        Tag.SYMBOL,
        97,
        Tag.OFFSET_END,
        2,
        Tag.LIMIT,
        3,
        Tag.BODY,
        1,
        1,
        2,
        0,
        4,
        5,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);
    expect(runestone.etching.isNone()).toBe(true);
  });

  test('decipher_etching_with_divisibility_and_symbol', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCHING),
        Tag.RUNE,
        4,
        Tag.DIVISIBILITY,
        1,
        Tag.SYMBOL,
        97,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility.unwrap()).toBe(1n);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers.isNone()).toBe(true);
    expect(etching.symbol.unwrap()).toBe('a');
  });

  test('tag_values_are_not_parsed_as_tags', () => {
    const runestone = decipher(
      [Tag.FLAGS, Flag.mask(Flag.ETCHING), Tag.DIVISIBILITY, Tag.BODY, Tag.BODY, 1, 1, 2, 0].map(
        u128
      )
    );

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);
    expect(runestone.etching.isSome()).toBe(true);
  });

  test('runestone_may_contain_multiple_edicts', () => {
    const runestone = decipher([Tag.BODY, 1, 1, 2, 0, 0, 3, 5, 0].map(u128));

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0n },
      { id: createRuneId(4), amount: 5n, output: 0n },
    ]);
  });

  test('runestones_with_invalid_rune_id_blocks_are_cenotaph', () => {
    expect(decipher([Tag.BODY, 1, 1, 2, 0, u128.MAX, 1, 0, 0].map(u128))).toMatchObject({
      edicts: [{ id: createRuneId(1), amount: 2n, output: 0n }],
      cenotaph: true,
    });
  });

  test('runestones_with_invalid_rune_id_txs_are_cenotaph', () => {
    expect(decipher([Tag.BODY, 1, 1, 2, 0, 1, u128.MAX, 0, 0].map(u128))).toMatchObject({
      edicts: [{ id: createRuneId(1), amount: 2n, output: 0n }],
      cenotaph: true,
    });
  });

  test('payload_pushes_are_concatenated', () => {
    const runestone = Runestone.decipher(
      getSimpleTransaction([
        bitcoin.opcodes.OP_RETURN,
        MAGIC_NUMBER,
        u128.encodeVarInt(u128(Tag.FLAGS)),
        u128.encodeVarInt(Flag.mask(Flag.ETCHING)),
        u128.encodeVarInt(u128(Tag.DIVISIBILITY)),
        u128.encodeVarInt(u128(5)),
        u128.encodeVarInt(u128(Tag.BODY)),
        u128.encodeVarInt(u128(1)),
        u128.encodeVarInt(u128(1)),
        u128.encodeVarInt(u128(2)),
        u128.encodeVarInt(u128(0)),
      ])
    ).unwrap();

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility.unwrap()).toBe(5n);
    expect(etching.rune.isNone()).toBe(true);
    expect(etching.spacers.isNone()).toBe(true);
    expect(etching.symbol.isNone()).toBe(true);
  });

  test('runestone_may_be_in_second_output', () => {
    const payload = getPayload([0, 1, 1, 2, 0].map(u128));

    const transaction = new bitcoin.Transaction();

    transaction.addOutput(Buffer.alloc(0), 0);
    transaction.addOutput(
      bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, MAGIC_NUMBER, payload]),
      0
    );

    const runestone = Runestone.decipher(transaction).unwrap();

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);
  });

  test('runestone_may_be_after_non_matching_op_return', () => {
    const payload = getPayload([0, 1, 1, 2, 0].map(u128));

    const transaction = new bitcoin.Transaction();

    transaction.addOutput(
      bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, Buffer.from('FOO')]),
      0
    );
    transaction.addOutput(
      bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, MAGIC_NUMBER, payload]),
      0
    );

    const runestone = Runestone.decipher(transaction).unwrap();

    expect(runestone.edicts).toEqual([{ id: createRuneId(1), amount: 2n, output: 0n }]);
  });

  test('runestone_size', () => {
    function testcase(edicts: Edict[], etching: Option<Etching>, size: number) {
      expect(new Runestone(false, None, None, edicts, etching).encipher().length).toBe(size);
    }

    testcase([], None, 2);

    testcase([], Some(new Etching(None, Some(new Rune(u128(0))), None, None, None, None)), 7);

    testcase(
      [],
      Some(new Etching(Some(MAX_DIVISIBILITY), Some(new Rune(u128(0))), None, None, None, None)),
      9
    );

    testcase(
      [],
      Some(
        new Etching(
          Some(MAX_DIVISIBILITY),
          Some(new Rune(u128(0))),
          Some(u32.MAX),
          Some('\u{10ffff}'),
          Some({
            cap: Some(u128.MAX),
            limit: Some(u128.MAX),
            offset: [Some(u64.MAX), Some(u64.MAX)],
            height: [Some(u64.MAX), Some(u64.MAX)],
          }),
          None
        )
      ),
      104
    );

    testcase([], Some(new Etching(None, Some(new Rune(u128.MAX)), None, None, None, None)), 25);

    testcase(
      [
        {
          amount: u128(0),
          id: new RuneId(u64(0), u32(0)),
          output: u32(0),
        },
      ],
      Some(new Etching(Some(MAX_DIVISIBILITY), Some(new Rune(u128.MAX)), None, None, None, None)),
      32
    );

    testcase(
      [
        {
          amount: u128.MAX,
          id: new RuneId(u64(0), u32(0)),
          output: u32(0),
        },
      ],
      Some(new Etching(Some(MAX_DIVISIBILITY), Some(new Rune(u128.MAX)), None, None, None, None)),
      50
    );

    testcase(
      [
        {
          amount: u128(0),
          id: new RuneId(u64(1_000_000), u32.MAX),
          output: u32(0),
        },
      ],
      None,
      14
    );

    testcase(
      [
        {
          amount: u128.MAX,
          id: new RuneId(u64(1_000_000), u32.MAX),
          output: u32(0),
        },
      ],
      None,
      32
    );

    testcase(
      [
        {
          amount: u128.MAX,
          id: new RuneId(u64(1_000_000), u32.MAX),
          output: u32(0),
        },
        {
          amount: u128.MAX,
          id: new RuneId(u64(1_000_000), u32.MAX),
          output: u32(0),
        },
      ],
      None,
      54
    );

    testcase(
      [
        {
          amount: u128.MAX,
          id: new RuneId(u64(1_000_000), u32.MAX),
          output: u32(0),
        },
        {
          amount: u128.MAX,
          id: new RuneId(u64(1_000_000), u32.MAX),
          output: u32(0),
        },
        {
          amount: u128.MAX,
          id: new RuneId(u64(1_000_000), u32.MAX),
          output: u32(0),
        },
      ],
      None,
      76
    );

    testcase(
      _.range(4).map(() => ({
        amount: u128(0xffff_ffff_ffff_ffffn),
        id: new RuneId(u64(1_000_000), u32.MAX),
        output: u32(0),
      })),
      None,
      62
    );

    testcase(
      _.range(5).map(() => ({
        amount: u128(0xffff_ffff_ffff_ffffn),
        id: new RuneId(u64(1_000_000), u32.MAX),
        output: u32(0),
      })),
      None,
      75
    );

    testcase(
      _.range(5).map(() => ({
        amount: u128(0xffff_ffff_ffff_ffffn),
        id: new RuneId(u64(0), u32.MAX),
        output: u32(0),
      })),
      None,
      73
    );

    testcase(
      _.range(5).map(() => ({
        amount: u128(1_000_000_000_000_000_000n),
        id: new RuneId(u64(1_000_000), u32.MAX),
        output: u32(0),
      })),
      None,
      70
    );
  });

  test('etching_with_term_greater_than_maximum_is_still_an_etching', () => {
    {
      const runestone = decipher(
        [Tag.FLAGS, Flag.mask(Flag.ETCHING), Tag.OFFSET_END, 0xffff_ffff_ffff_ffffn + 1n].map(u128)
      );

      expect(runestone.cenotaph).toBe(true);
      expect(runestone.etching.isSome()).toBe(true);
    }

    {
      const runestone = decipher(
        [
          Tag.FLAGS,
          Flag.mask(Flag.ETCHING) | Flag.mask(Flag.TERMS),
          Tag.OFFSET_END,
          u64.MAX + 1n,
        ].map(u128)
      );

      const etching = runestone.etching.unwrap();
      const mint = etching.terms.unwrap();
      expect(mint.offset[1].isNone()).toBe(true);
    }
  });

  test('encipher', () => {
    function testcase(runestone: Runestone, expected: (number | bigint)[]) {
      const scriptPubKey = runestone.encipher();

      const transaction = new bitcoin.Transaction();
      transaction.addOutput(scriptPubKey, 0);

      const payload = Runestone.payload(transaction).unwrap();
      expect(isValidPayload(payload)).toBe(true);

      expect(Runestone.integers(payload as Buffer).unwrap()).toEqual(expected.map(u128));

      const txnRunestone = Runestone.fromTransaction(transaction).unwrap();

      expect(txnRunestone.cenotaph).toBe(runestone.cenotaph);
      expect(txnRunestone.mint.isSome()).toBe(runestone.mint.isSome());
      if (txnRunestone.mint.isSome()) {
        expect(txnRunestone.mint.unwrap()).toEqual(runestone.mint.unwrap());
      }

      expect(txnRunestone.pointer.isSome()).toBe(runestone.pointer.isSome());
      if (txnRunestone.pointer.isSome()) {
        expect(txnRunestone.pointer.unwrap()).toBe(runestone.pointer.unwrap());
      }

      expect(_.sortBy(txnRunestone.edicts, (edict) => edict.id)).toEqual(
        _.sortBy(runestone.edicts, (edict) => edict.id)
      );

      expect(txnRunestone.etching.isSome()).toBe(runestone.etching.isSome());
      if (txnRunestone.etching.isSome()) {
        const txnEtching = txnRunestone.etching.unwrap();
        const etching = runestone.etching.unwrap();

        expect(txnEtching.divisibility.map(BigInt).unwrapOr(-1n)).toBe(
          etching.divisibility.map(BigInt).unwrapOr(-1n)
        );
        expect(txnEtching.terms.isSome()).toBe(etching.terms.isSome());
        if (txnEtching.terms.isSome()) {
          const txnMint = txnEtching.terms.unwrap();
          const mint = etching.terms.unwrap();

          expect(txnMint.offset[0].isSome()).toBe(mint.offset[0].isSome());
          if (txnMint.offset[0].isSome()) {
            expect(txnMint.offset[0].unwrap()).toBe(mint.offset[0].unwrap());
          }
          expect(txnMint.offset[1].isSome()).toBe(mint.offset[1].isSome());
          if (txnMint.offset[1].isSome()) {
            expect(txnMint.offset[1].unwrap()).toBe(mint.offset[1].unwrap());
          }

          expect(txnMint.limit.isSome()).toBe(mint.limit.isSome());
          if (txnMint.limit.isSome()) {
            expect(txnMint.limit.unwrap()).toBe(mint.limit.unwrap());
          }

          expect(txnMint.height[0].isSome()).toBe(mint.height[0].isSome());
          if (txnMint.height[0].isSome()) {
            expect(txnMint.height[0].unwrap()).toBe(mint.height[0].unwrap());
          }
          expect(txnMint.height[1].isSome()).toBe(mint.height[1].isSome());
          if (txnMint.height[1].isSome()) {
            expect(txnMint.height[1].unwrap()).toBe(mint.height[1].unwrap());
          }

          expect(txnMint.cap.isSome()).toBe(mint.cap.isSome());
          if (txnMint.cap.isSome()) {
            expect(txnMint.cap.unwrap()).toBe(mint.cap.unwrap());
          }
        }

        expect(txnEtching.rune.map((value) => value.toString()).unwrapOr('')).toBe(
          etching.rune.map((value) => value.toString()).unwrapOr('')
        );
        expect(txnEtching.spacers.map(BigInt).unwrapOr(-1n)).toBe(
          etching.spacers.map(BigInt).unwrapOr(-1n)
        );
        expect(txnEtching.symbol.unwrapOr('')).toBe(etching.symbol.unwrapOr(''));
      }
    }

    testcase(new Runestone(false, None, None, [], None), []);

    // case(
    //   Runestone {
    //     cenotaph: true,
    //     edicts: vec![
    //       Edict {
    //         id: RuneId::new(2, 3).unwrap(),
    //         amount: 1,
    //         output: 0n,
    //       },
    //       Edict {
    //         id: RuneId::new(5, 6).unwrap(),
    //         amount: 4,
    //         output: 1,
    //       },
    //     ],
    //     etching: Some(Etching {
    //       divisibility: Some(7),
    //       premine: Some(8),
    //       rune: Some(Rune(9)),
    //       spacers: Some(10),
    //       symbol: Some('@'),
    //       terms: Some(Terms {
    //         cap: Some(11),
    //         height: (Some(12), Some(13)),
    //         amount: Some(14),
    //         offset: (Some(15), Some(16)),
    //       }),
    //     }),
    //     mint: Some(RuneId::new(17, 18).unwrap()),
    //     pointer: Some(0),
    //   },
    //   &[
    //     Tag::Flags.into(),
    //     Flag::Etching.mask() | Flag::Terms.mask(),
    //     Tag::Rune.into(),
    //     9,
    //     Tag::Divisibility.into(),
    //     7,
    //     Tag::Spacers.into(),
    //     10,
    //     Tag::Symbol.into(),
    //     '@'.into(),
    //     Tag::Premine.into(),
    //     8,
    //     Tag::Amount.into(),
    //     14,
    //     Tag::Cap.into(),
    //     11,
    //     Tag::HeightStart.into(),
    //     12,
    //     Tag::HeightEnd.into(),
    //     13,
    //     Tag::OffsetStart.into(),
    //     15,
    //     Tag::OffsetEnd.into(),
    //     16,
    //     Tag::Mint.into(),
    //     17,
    //     Tag::Mint.into(),
    //     18,
    //     Tag::Pointer.into(),
    //     0,
    //     Tag::Cenotaph.into(),
    //     0,
    //     Tag::Body.into(),
    //     2,
    //     3,
    //     1,
    //     0,
    //     3,
    //     6,
    //     4,
    //     1,
    //   ],
    // );

    testcase(
      new Runestone(
        true,
        Some(new RuneId(u64(17), u32(18))),
        Some(u32(0)),
        [
          {
            id: new RuneId(u64(2), u32(3)),
            amount: u128(1),
            output: u32(0),
          },
          {
            id: new RuneId(u64(5), u32(6)),
            amount: u128(4),
            output: u32(1),
          },
        ],
        Some(
          new Etching(
            Some(u8(7)),
            Some(new Rune(u128(9))),
            Some(u32(10)),
            Some('@'),
            Some({
              cap: Some(u128(11)),
              height: [Some(u64(12)), Some(u64(13))],
              limit: Some(u128(14)),
              offset: [Some(u64(15)), Some(u64(16))],
            }),
            Some(u128(8))
          )
        )
      ),
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCHING) | Flag.mask(Flag.TERMS),
        Tag.RUNE,
        9,
        Tag.DIVISIBILITY,
        7,
        Tag.SPACERS,
        10,
        Tag.SYMBOL,
        '@'.codePointAt(0)!,
        Tag.PREMINE,
        8,
        Tag.LIMIT,
        14,
        Tag.CAP,
        11,
        Tag.HEIGHT_START,
        12,
        Tag.HEIGHT_END,
        13,
        Tag.OFFSET_START,
        15,
        Tag.OFFSET_END,
        16,
        Tag.MINT,
        17,
        Tag.MINT,
        18,
        Tag.POINTER,
        0,
        Tag.CENOTAPH,
        0,
        Tag.BODY,
        2,
        3,
        1,
        0,
        3,
        6,
        4,
        1,
      ]
    );

    testcase(
      new Runestone(
        false,
        None,
        None,
        [],
        Some(new Etching(None, Some(new Rune(u128(3))), None, None, None, None))
      ),
      [Tag.FLAGS, Flag.mask(Flag.ETCHING), Tag.RUNE, 3]
    );

    testcase(
      new Runestone(false, None, None, [], Some(new Etching(None, None, None, None, None, None))),
      [Tag.FLAGS, Flag.mask(Flag.ETCHING)]
    );

    testcase(new Runestone(true, None, None, [], None), [Tag.CENOTAPH, 0]);
  });

  test('runestone_payload_is_chunked', () => {
    {
      const script = new Runestone(
        false,
        None,
        None,
        _.range(129).map((i) => ({
          id: new RuneId(u64(0), u32(0)),
          amount: u128(0),
          output: u32(0),
        })),
        None
      ).encipher();

      const instructions = bitcoin.script.decompile(script);
      expect(instructions?.length).toBe(3);
    }

    {
      const script = new Runestone(
        false,
        None,
        None,
        _.range(130).map((i) => ({
          id: createRuneId(0),
          amount: u128(0),
          output: u32(0),
        })),
        None
      ).encipher();

      const instructions = bitcoin.script.decompile(script);
      expect(instructions?.length).toBe(4);
    }
  });

  test('max_spacers', () => {
    let rune = '';

    const maxRune = new Rune(u128.MAX).toString();
    for (const i of _.range(maxRune.length)) {
      if (i > 0) {
        rune += '•';
      }

      rune += maxRune.charAt(i);
    }

    expect(SpacedRune.fromString(rune).spacers).toBe(MAX_SPACERS);
  });

  test('edict_output_greater_than_32_max_produces_cenotaph', () => {
    expect(decipher([Tag.BODY, 1, 1, 1, u32.MAX + 1n].map(u128)).cenotaph).toBe(true);
  });

  test('partial_mint_produces_cenotaph', () => {
    expect(decipher([Tag.MINT, 1].map(u128)).cenotaph).toBe(true);
  });

  test('invalid_mint_produces_cenotaph', () => {
    expect(decipher([Tag.MINT, 0, Tag.MINT, 1].map(u128)).cenotaph).toBe(true);
  });

  test('invalid_deadline_produces_cenotaph', () => {
    expect(decipher([Tag.OFFSET_END, u128.MAX].map(u128)).cenotaph).toBe(true);
  });

  test('invalid_deadline_produces_cenotaph', () => {
    expect(decipher([Tag.POINTER, 1].map(u128)).cenotaph).toBe(true);
    expect(decipher([Tag.POINTER, u128.MAX].map(u128)).cenotaph).toBe(true);
  });

  test('invalid_divisibility_does_not_produce_cenotaph', () => {
    expect(decipher([Tag.DIVISIBILITY, u128.MAX].map(u128)).cenotaph).toBe(false);
  });

  test('min_and_max_runes_are_not_cenotaphs', () => {
    expect(decipher([Tag.RUNE, 0].map(u128)).cenotaph).toBe(false);
    expect(decipher([Tag.RUNE, u128.MAX].map(u128)).cenotaph).toBe(false);
  });

  test('invalid_spacers_does_not_produce_cenotaph', () => {
    expect(decipher([Tag.SPACERS, u128.MAX].map(u128)).cenotaph).toBe(false);
  });

  test('invalid_symbol_does_not_produce_cenotaph', () => {
    expect(decipher([Tag.SYMBOL, u128.MAX].map(u128)).cenotaph).toBe(false);
  });

  test('invalid_term_produces_cenotaph', () => {
    expect(decipher([Tag.OFFSET_END, u128.MAX].map(u128)).cenotaph).toBe(true);
  });

  test('invalid_supply_produces_cenotaph', () => {
    expect(
      decipher(
        [Tag.FLAGS, Flag.mask(Flag.ETCHING | Flag.TERMS), Tag.CAP, 1, Tag.LIMIT, u128.MAX].map(u128)
      ).cenotaph
    ).toBe(false);

    expect(
      decipher(
        [Tag.FLAGS, Flag.mask(Flag.ETCHING | Flag.TERMS), Tag.CAP, 2, Tag.LIMIT, u128.MAX].map(u128)
      ).cenotaph
    ).toBe(true);

    expect(
      decipher(
        [
          Tag.FLAGS,
          Flag.mask(Flag.ETCHING | Flag.TERMS),
          Tag.CAP,
          2,
          Tag.LIMIT,
          u128.MAX / 2n + 1n,
        ].map(u128)
      ).cenotaph
    ).toBe(true);

    expect(
      decipher(
        [
          Tag.FLAGS,
          Flag.mask(Flag.ETCHING | Flag.TERMS),
          Tag.PREMINE,
          1,
          Tag.CAP,
          1,
          Tag.LIMIT,
          u128.MAX,
        ].map(u128)
      ).cenotaph
    ).toBe(true);
  });
});
