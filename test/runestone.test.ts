import * as bitcoin from 'bitcoinjs-lib';
import _ from 'lodash';
import { MAX_SPACERS, Runestone, isValidPayload } from '../src/runestone';
import { U32_MAX, u128 } from '../src/u128';
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
  return new RuneId(1, tx);
}

describe('runestone', () => {
  function decipher(integers: u128[]): Runestone {
    return Runestone.decipher(
      getSimpleTransaction([
        bitcoin.opcodes.OP_RETURN,
        MAGIC_NUMBER,
        getPayload(integers),
      ])
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
      Runestone.fromTransaction(
        getSimpleTransaction([bitcoin.opcodes.OP_PUSHBYTES_4])
      ).isNone()
    ).toBe(true);
  });

  test('deciphering_transaction_with_no_outputs_returns_none', () => {
    expect(Runestone.decipher(new bitcoin.Transaction()).isNone()).toBe(true);
  });

  test('deciphering_transaction_with_non_op_return_output_returns_none', () => {
    expect(
      Runestone.decipher(getSimpleTransaction([Buffer.alloc(0)])).isNone()
    ).toBe(true);
  });

  test('deciphering_transaction_with_bare_op_return_returns_none', () => {
    expect(
      Runestone.decipher(
        getSimpleTransaction([bitcoin.opcodes.OP_RETURN])
      ).isNone()
    ).toBe(true);
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
      Runestone.decipher(
        getSimpleTransaction([bitcoin.opcodes.OP_PUSHBYTES_4])
      ).isNone()
    ).toBe(true);
  });

  test('deciphering_valid_runestone_with_invalid_script_postfix_returns_script_error', () => {
    const transaction = getSimpleTransaction([
      bitcoin.opcodes.OP_RETURN,
      MAGIC_NUMBER,
    ]);

    transaction.outs[0].script = Buffer.concat([
      transaction.outs[0].script,
      Buffer.from([4]),
    ]);

    expect(() => Runestone.decipher(transaction)).toThrow();
  });

  test('deciphering_runestone_with_truncated_varint_succeeds', () => {
    expect(
      Runestone.decipher(
        getSimpleTransaction([
          bitcoin.opcodes.OP_RETURN,
          MAGIC_NUMBER,
          Buffer.from([128]),
        ])
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
      Runestone.decipher(
        getSimpleTransaction([bitcoin.opcodes.OP_RETURN, MAGIC_NUMBER])
      ).isSome()
    ).toBe(true);
  });

  test('error_in_input_aborts_search_for_runestone', () => {
    const payload = getPayload([0, 1, 2, 3].map(u128));

    const transaction = new bitcoin.Transaction();
    let scriptPubKey = bitcoin.script.compile([
      bitcoin.opcodes.OP_RETURN,
      MAGIC_NUMBER,
      4,
    ]);
    scriptPubKey = Buffer.concat([scriptPubKey, Buffer.from([4])]);
    transaction.addOutput(bitcoin.script.compile(scriptPubKey), 0);
    transaction.addOutput(
      bitcoin.script.compile([
        bitcoin.opcodes.OP_RETURN,
        MAGIC_NUMBER,
        payload,
      ]),
      0
    );

    expect(() => Runestone.decipher(transaction)).toThrow();
  });

  test('deciphering_non_empty_runestone_is_successful', () => {
    expect(decipher([Tag.BODY, 1, 1, 2, 0].map(u128))).toMatchObject({
      edicts: [{ id: createRuneId(1), amount: 2n, output: 0 }],
    });
  });

  test('decipher_etching', () => {
    const runestone = decipher(
      [Tag.FLAGS, Flag.mask(Flag.ETCH), Tag.BODY, 1, 1, 2, 0].map(u128)
    );

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility).toBe(0);
    expect(etching.rune.isNone()).toBe(true);
    expect(etching.spacers).toBe(0);
    expect(etching.symbol.isNone()).toBe(true);
    expect(etching.mint.isNone()).toBe(true);
  });

  test('decipher_etching_with_rune', () => {
    const runestone = decipher(
      [Tag.FLAGS, Flag.mask(Flag.ETCH), Tag.RUNE, 4, Tag.BODY, 1, 1, 2, 0].map(
        u128
      )
    );

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility).toBe(0);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers).toBe(0);
    expect(etching.symbol.isNone()).toBe(true);
    expect(etching.mint.isNone()).toBe(true);
  });

  test('etch_flag_is_required_to_etch_rune_even_if_mint_is_set', () => {
    const runestone = decipher(
      [Tag.FLAGS, Flag.mask(Flag.MINT), Tag.TERM, 4, Tag.BODY, 1, 1, 2, 0].map(
        u128
      )
    );

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);
    expect(runestone.etching.isNone()).toBe(true);
  });

  test('decipher_etching_with_term', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCH) | Flag.mask(Flag.MINT),
        Tag.TERM,
        4,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility).toBe(0);
    expect(etching.rune.isNone()).toBe(true);
    expect(etching.spacers).toBe(0);
    expect(etching.symbol.isNone()).toBe(true);

    const mint = etching.mint.unwrap();
    expect(mint.term.unwrap()).toBe(4);
    expect(mint.deadline.isNone()).toBe(true);
    expect(mint.limit.isNone()).toBe(true);
  });

  test('decipher_etching_with_limit', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCH) | Flag.mask(Flag.MINT),
        Tag.LIMIT,
        4,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility).toBe(0);
    expect(etching.rune.isNone()).toBe(true);
    expect(etching.spacers).toBe(0);
    expect(etching.symbol.isNone()).toBe(true);

    const mint = etching.mint.unwrap();
    expect(mint.term.isNone()).toBe(true);
    expect(mint.deadline.isNone()).toBe(true);
    expect(mint.limit.unwrap()).toBe(4n);
  });

  test('invalid_varint_produces_cenotaph', () => {
    expect(
      Runestone.decipher(
        getSimpleTransaction([
          bitcoin.opcodes.OP_RETURN,
          MAGIC_NUMBER,
          Buffer.from([128]),
        ])
      ).unwrap()
    ).toMatchObject({ cenotaph: true });
  });

  test('duplicate_even_tags_produce_cenotaph', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCH),
        Tag.RUNE,
        4,
        Tag.RUNE,
        5,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);
    expect(runestone.cenotaph).toBe(true);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility).toBe(0);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers).toBe(0);
    expect(etching.symbol.isNone()).toBe(true);
    expect(etching.mint.isNone()).toBe(true);
  });

  test('duplicate_odd_tags_are_ignored', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCH),
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

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);
    expect(runestone.etching.unwrap()).toMatchObject({
      divisibility: 4,
    });
  });

  test('runestone_with_unrecognized_even_tag_is_cenotaph', () => {
    const runestone = decipher(
      [Tag.CENOTAPH, 0, Tag.BODY, 1, 1, 2, 0].map(u128)
    );

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);
    expect(runestone.cenotaph).toBe(true);
  });

  test('runestone_with_unrecognized_flag_is_cenotaph', () => {
    const runestone = decipher(
      [Tag.FLAGS, Flag.mask(Flag.CENOTAPH), Tag.BODY, 1, 1, 2, 0].map(u128)
    );

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);
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
        expect(runestone.edicts).toEqual([
          { id: createRuneId(1), amount: 2n, output: 0 },
        ]);
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
        Flag.mask(Flag.ETCH),
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

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility).toBe(5);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers).toBe(0);
    expect(etching.symbol.isNone()).toBe(true);
    expect(etching.mint.isNone()).toBe(true);
  });

  test('divisibility_above_max_is_ignored', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCH),
        Tag.RUNE,
        4,
        Tag.DIVISIBILITY,
        MAX_DIVISIBILITY + 1,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility).toBe(0);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers).toBe(0);
    expect(etching.symbol.isNone()).toBe(true);
    expect(etching.mint.isNone()).toBe(true);
  });

  test('symbol_above_max_is_ignored', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCH),
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

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility).toBe(0);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers).toBe(0);
    expect(etching.symbol.isNone()).toBe(true);
    expect(etching.mint.isNone()).toBe(true);
  });

  test('decipher_etching_with_symbol', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCH),
        Tag.RUNE,
        4,
        Tag.SYMBOL,
        97,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility).toBe(0);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers).toBe(0);
    expect(etching.symbol.unwrap()).toBe('a');
    expect(etching.mint.isNone()).toBe(true);
  });

  test('decipher_etching_with_all_etching_tags', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCH) | Flag.mask(Flag.MINT),
        Tag.RUNE,
        4,
        Tag.DEADLINE,
        7,
        Tag.DIVISIBILITY,
        1,
        Tag.SPACERS,
        5,
        Tag.SYMBOL,
        97,
        Tag.TERM,
        2,
        Tag.LIMIT,
        3,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility).toBe(1);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers).toBe(5);
    expect(etching.symbol.unwrap()).toBe('a');

    const mint = etching.mint.unwrap();
    expect(mint.deadline.unwrap()).toBe(7);
    expect(mint.limit.unwrap()).toBe(3n);
    expect(mint.term.unwrap()).toBe(2);
  });

  test('recognized_even_etching_fields_in_non_etching_are_ignored', () => {
    const runestone = decipher(
      [
        Tag.RUNE,
        4,
        Tag.DIVISIBILITY,
        1,
        Tag.SYMBOL,
        97,
        Tag.TERM,
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

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);
    expect(runestone.etching.isNone()).toBe(true);
  });

  test('decipher_etching_with_divisibility_and_symbol', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCH),
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

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility).toBe(1);
    expect(etching.rune.unwrap().value).toBe(4n);
    expect(etching.spacers).toBe(0);
    expect(etching.symbol.unwrap()).toBe('a');
  });

  test('tag_values_are_not_parsed_as_tags', () => {
    const runestone = decipher(
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCH),
        Tag.DIVISIBILITY,
        Tag.BODY,
        Tag.BODY,
        1,
        1,
        2,
        0,
      ].map(u128)
    );

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);
    expect(runestone.etching.isSome()).toBe(true);
  });

  test('runestone_may_contain_multiple_edicts', () => {
    const runestone = decipher([Tag.BODY, 1, 1, 2, 0, 0, 3, 5, 0].map(u128));

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
      { id: createRuneId(4), amount: 5n, output: 0 },
    ]);
  });

  test('runestones_with_invalid_rune_id_blocks_are_cenotaph', () => {
    expect(
      decipher([Tag.BODY, 1, 1, 2, 0, u128.MAX, 1, 0, 0].map(u128))
    ).toMatchObject({
      edicts: [{ id: createRuneId(1), amount: 2n, output: 0 }],
      cenotaph: true,
    });
  });

  test('runestones_with_invalid_rune_id_txs_are_cenotaph', () => {
    expect(
      decipher([Tag.BODY, 1, 1, 2, 0, 1, u128.MAX, 0, 0].map(u128))
    ).toMatchObject({
      edicts: [{ id: createRuneId(1), amount: 2n, output: 0 }],
      cenotaph: true,
    });
  });

  test('payload_pushes_are_concatenated', () => {
    const runestone = Runestone.decipher(
      getSimpleTransaction([
        bitcoin.opcodes.OP_RETURN,
        MAGIC_NUMBER,
        u128.encodeVarInt(u128(Tag.FLAGS)),
        u128.encodeVarInt(Flag.mask(Flag.ETCH)),
        u128.encodeVarInt(u128(Tag.DIVISIBILITY)),
        u128.encodeVarInt(u128(5)),
        u128.encodeVarInt(u128(Tag.BODY)),
        u128.encodeVarInt(u128(1)),
        u128.encodeVarInt(u128(1)),
        u128.encodeVarInt(u128(2)),
        u128.encodeVarInt(u128(0)),
      ])
    ).unwrap();

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);

    const etching = runestone.etching.unwrap();
    expect(etching.divisibility).toBe(5);
    expect(etching.rune.isNone()).toBe(true);
    expect(etching.spacers).toBe(0);
    expect(etching.symbol.isNone()).toBe(true);
  });

  test('runestone_may_be_in_second_output', () => {
    const payload = getPayload([0, 1, 1, 2, 0].map(u128));

    const transaction = new bitcoin.Transaction();

    transaction.addOutput(Buffer.alloc(0), 0);
    transaction.addOutput(
      bitcoin.script.compile([
        bitcoin.opcodes.OP_RETURN,
        MAGIC_NUMBER,
        payload,
      ]),
      0
    );

    const runestone = Runestone.decipher(transaction).unwrap();

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);
  });

  test('runestone_may_be_after_non_matching_op_return', () => {
    const payload = getPayload([0, 1, 1, 2, 0].map(u128));

    const transaction = new bitcoin.Transaction();

    transaction.addOutput(
      bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, Buffer.from('FOO')]),
      0
    );
    transaction.addOutput(
      bitcoin.script.compile([
        bitcoin.opcodes.OP_RETURN,
        MAGIC_NUMBER,
        payload,
      ]),
      0
    );

    const runestone = Runestone.decipher(transaction).unwrap();

    expect(runestone.edicts).toEqual([
      { id: createRuneId(1), amount: 2n, output: 0 },
    ]);
  });

  test('runestone_size', () => {
    function testcase(edicts: Edict[], etching: Option<Etching>, size: number) {
      expect(
        new Runestone(false, None, None, edicts, etching).encipher().length
      ).toBe(size);
    }

    testcase([], None, 2);

    testcase(
      [],
      Some(new Etching(0, Some(new Rune(u128(0))), 0, None, None)),
      7
    );

    testcase(
      [],
      Some(
        new Etching(MAX_DIVISIBILITY, Some(new Rune(u128(0))), 0, None, None)
      ),
      9
    );

    testcase(
      [],
      Some(
        new Etching(
          MAX_DIVISIBILITY,
          Some(new Rune(u128(0))),
          1,
          Some('$'),
          Some({
            deadline: Some(10000),
            limit: Some(u128(1)),
            term: Some(1),
          })
        )
      ),
      20
    );

    testcase(
      [],
      Some(new Etching(0, Some(new Rune(u128.MAX)), 0, None, None)),
      25
    );

    testcase(
      [
        {
          amount: u128(0),
          id: new RuneId(0, 0),
          output: 0,
        },
      ],
      Some(
        new Etching(MAX_DIVISIBILITY, Some(new Rune(u128.MAX)), 0, None, None)
      ),
      32
    );

    testcase(
      [
        {
          amount: u128.MAX,
          id: new RuneId(0, 0),
          output: 0,
        },
      ],
      Some(
        new Etching(MAX_DIVISIBILITY, Some(new Rune(u128.MAX)), 0, None, None)
      ),
      50
    );

    testcase(
      [
        {
          amount: u128(0),
          id: new RuneId(1_000_000, U32_MAX),
          output: 0,
        },
      ],
      None,
      14
    );

    testcase(
      [
        {
          amount: u128.MAX,
          id: new RuneId(1_000_000, U32_MAX),
          output: 0,
        },
      ],
      None,
      32
    );

    testcase(
      [
        {
          amount: u128.MAX,
          id: new RuneId(1_000_000, U32_MAX),
          output: 0,
        },
        {
          amount: u128.MAX,
          id: new RuneId(1_000_000, U32_MAX),
          output: 0,
        },
      ],
      None,
      54
    );

    testcase(
      [
        {
          amount: u128.MAX,
          id: new RuneId(1_000_000, U32_MAX),
          output: 0,
        },
        {
          amount: u128.MAX,
          id: new RuneId(1_000_000, U32_MAX),
          output: 0,
        },
        {
          amount: u128.MAX,
          id: new RuneId(1_000_000, U32_MAX),
          output: 0,
        },
      ],
      None,
      76
    );

    testcase(
      _.range(4).map(() => ({
        amount: u128(0xffff_ffff_ffff_ffffn),
        id: new RuneId(1_000_000, U32_MAX),
        output: 0,
      })),
      None,
      62
    );

    testcase(
      _.range(5).map(() => ({
        amount: u128(0xffff_ffff_ffff_ffffn),
        id: new RuneId(1_000_000, U32_MAX),
        output: 0,
      })),
      None,
      75
    );

    testcase(
      _.range(5).map(() => ({
        amount: u128(0xffff_ffff_ffff_ffffn),
        id: new RuneId(0, U32_MAX),
        output: 0,
      })),
      None,
      73
    );

    testcase(
      _.range(5).map(() => ({
        amount: u128(1_000_000_000_000_000_000n),
        id: new RuneId(1_000_000, U32_MAX),
        output: 0,
      })),
      None,
      70
    );
  });

  test('etching_with_term_greater_than_maximum_is_still_an_etching', () => {
    {
      const runestone = decipher(
        [
          Tag.FLAGS,
          Flag.mask(Flag.ETCH),
          Tag.TERM,
          0xffff_ffff_ffff_ffffn + 1n,
        ].map(u128)
      );

      expect(runestone.cenotaph).toBe(true);
      expect(runestone.etching.isSome()).toBe(true);
    }

    {
      const runestone = decipher(
        [
          Tag.FLAGS,
          Flag.mask(Flag.ETCH) | Flag.mask(Flag.MINT),
          Tag.TERM,
          0xffff_ffffn + 1n,
        ].map(u128)
      );

      const etching = runestone.etching.unwrap();
      const mint = etching.mint.unwrap();
      expect(mint.term.isNone()).toBe(true);
    }
  });

  test('encipher', () => {
    function testcase(runestone: Runestone, expected: (number | bigint)[]) {
      const scriptPubKey = runestone.encipher();

      const transaction = new bitcoin.Transaction();
      transaction.addOutput(scriptPubKey, 0);

      const payload = Runestone.payload(transaction).unwrap();
      expect(isValidPayload(payload)).toBe(true);

      expect(Runestone.integers(payload as Buffer).unwrap()).toEqual(
        expected.map(u128)
      );

      const txnRunestone = Runestone.fromTransaction(transaction).unwrap();

      expect(txnRunestone.cenotaph).toBe(runestone.cenotaph);
      expect(txnRunestone.claim.isSome()).toBe(runestone.claim.isSome());
      if (txnRunestone.claim.isSome()) {
        expect(txnRunestone.claim.unwrap()).toEqual(runestone.claim.unwrap());
      }

      expect(txnRunestone.defaultOutput.isSome()).toBe(
        runestone.defaultOutput.isSome()
      );
      if (txnRunestone.defaultOutput.isSome()) {
        expect(txnRunestone.defaultOutput.unwrap()).toBe(
          runestone.defaultOutput.unwrap()
        );
      }

      expect(_.sortBy(txnRunestone.edicts, (edict) => edict.id)).toEqual(
        _.sortBy(runestone.edicts, (edict) => edict.id)
      );

      expect(txnRunestone.etching.isSome()).toBe(runestone.etching.isSome());
      if (txnRunestone.etching.isSome()) {
        const txnEtching = txnRunestone.etching.unwrap();
        const etching = runestone.etching.unwrap();

        expect(txnEtching.divisibility).toBe(etching.divisibility);
        expect(txnEtching.mint.isSome()).toBe(etching.mint.isSome());
        if (txnEtching.mint.isSome()) {
          const txnMint = txnEtching.mint.unwrap();
          const mint = etching.mint.unwrap();

          expect(txnMint.deadline.isSome()).toBe(mint.deadline.isSome());
          if (txnMint.deadline.isSome()) {
            expect(txnMint.deadline.unwrap()).toBe(mint.deadline.unwrap());
          }

          expect(txnMint.limit.isSome()).toBe(mint.limit.isSome());
          if (txnMint.limit.isSome()) {
            expect(txnMint.limit.unwrap()).toBe(mint.limit.unwrap());
          }

          expect(txnMint.term.isSome()).toBe(mint.term.isSome());
          if (txnMint.term.isSome()) {
            expect(txnMint.term.unwrap()).toBe(mint.term.unwrap());
          }
        }

        expect(
          txnEtching.rune.map((value) => value.toString()).unwrapOr('')
        ).toBe(etching.rune.map((value) => value.toString()).unwrapOr(''));
        expect(txnEtching.spacers).toBe(etching.spacers);
        expect(txnEtching.symbol.unwrapOr('')).toBe(
          etching.symbol.unwrapOr('')
        );
      }
    }

    testcase(new Runestone(false, None, None, [], None), []);

    testcase(
      new Runestone(
        true,
        Some(createRuneId(12)),
        Some(0),
        [
          {
            amount: u128(8),
            id: createRuneId(9),
            output: 0,
          },
          {
            amount: u128(5),
            id: createRuneId(6),
            output: 1,
          },
        ],
        Some(
          new Etching(
            1,
            Some(new Rune(u128(4))),
            6,
            Some('@'),
            Some({
              deadline: Some(2),
              limit: Some(u128(3)),
              term: Some(5),
            })
          )
        )
      ),
      [
        Tag.FLAGS,
        Flag.mask(Flag.ETCH) | Flag.mask(Flag.MINT),
        Tag.RUNE,
        4,
        Tag.DIVISIBILITY,
        1,
        Tag.SPACERS,
        6,
        Tag.SYMBOL,
        '@'.codePointAt(0)!,
        Tag.DEADLINE,
        2,
        Tag.LIMIT,
        3,
        Tag.TERM,
        5,
        Tag.CLAIM,
        1,
        Tag.CLAIM,
        12,
        Tag.DEFAULT_OUTPUT,
        0,
        Tag.CENOTAPH,
        0,
        Tag.BODY,
        1,
        6,
        5,
        1,
        0,
        3,
        8,
        0,
      ]
    );

    testcase(
      new Runestone(
        false,
        None,
        None,
        [],
        Some(new Etching(0, Some(new Rune(u128(3))), 0, None, None))
      ),
      [Tag.FLAGS, Flag.mask(Flag.ETCH), Tag.RUNE, 3]
    );

    testcase(
      new Runestone(
        false,
        None,
        None,
        [],
        Some(new Etching(0, None, 0, None, None))
      ),
      [Tag.FLAGS, Flag.mask(Flag.ETCH)]
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
          id: new RuneId(0, 0),
          amount: u128(0),
          output: 0,
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
          output: 0,
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
    expect(decipher([Tag.BODY, 1, 1, 1, U32_MAX + 1].map(u128)).cenotaph).toBe(
      true
    );
  });

  test('partial_claim_produces_cenotaph', () => {
    expect(decipher([Tag.CLAIM, 1].map(u128)).cenotaph).toBe(true);
  });

  test('invalid_claim_produces_cenotaph', () => {
    expect(decipher([Tag.CLAIM, 0, Tag.CLAIM, 1].map(u128)).cenotaph).toBe(
      true
    );
  });

  test('invalid_deadline_produces_cenotaph', () => {
    expect(decipher([Tag.DEADLINE, u128.MAX].map(u128)).cenotaph).toBe(true);
  });

  test('invalid_deadline_produces_cenotaph', () => {
    expect(decipher([Tag.DEFAULT_OUTPUT, 1].map(u128)).cenotaph).toBe(true);
    expect(decipher([Tag.DEFAULT_OUTPUT, u128.MAX].map(u128)).cenotaph).toBe(
      true
    );
  });

  test('invalid_divisibility_does_not_produce_cenotaph', () => {
    expect(decipher([Tag.DIVISIBILITY, u128.MAX].map(u128)).cenotaph).toBe(
      false
    );
  });

  test('invalid_limit_produces_cenotaph', () => {
    expect(decipher([Tag.LIMIT, u128.MAX].map(u128)).cenotaph).toBe(true);
    expect(
      decipher([Tag.LIMIT, 0xffffffff_ffffffffn + 1n].map(u128)).cenotaph
    ).toBe(true);
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
    expect(decipher([Tag.TERM, u128.MAX].map(u128)).cenotaph).toBe(true);
  });
});
