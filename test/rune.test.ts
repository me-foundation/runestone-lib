import _ from 'lodash';
import { U128_MAX_BIGINT, u128 } from '../src/integer/u128';
import { Rune } from '../src/rune';
import { Chain } from '../src/chain';
import { RESERVED, SUBSIDY_HALVING_INTERVAL } from '../src/constants';

describe('rune', () => {
  test('round trip', () => {
    function testcase(n: u128, s: string) {
      expect(new Rune(n).toString()).toEqual(s);
      expect(Rune.fromString(s).value).toBe(n);
    }

    testcase(u128(0), 'A');
    testcase(u128(1), 'B');
    testcase(u128(2), 'C');
    testcase(u128(3), 'D');
    testcase(u128(4), 'E');
    testcase(u128(5), 'F');
    testcase(u128(6), 'G');
    testcase(u128(7), 'H');
    testcase(u128(8), 'I');
    testcase(u128(9), 'J');
    testcase(u128(10), 'K');
    testcase(u128(11), 'L');
    testcase(u128(12), 'M');
    testcase(u128(13), 'N');
    testcase(u128(14), 'O');
    testcase(u128(15), 'P');
    testcase(u128(16), 'Q');
    testcase(u128(17), 'R');
    testcase(u128(18), 'S');
    testcase(u128(19), 'T');
    testcase(u128(20), 'U');
    testcase(u128(21), 'V');
    testcase(u128(22), 'W');
    testcase(u128(23), 'X');
    testcase(u128(24), 'Y');
    testcase(u128(25), 'Z');
    testcase(u128(26), 'AA');
    testcase(u128(27), 'AB');
    testcase(u128(51), 'AZ');
    testcase(u128(52), 'BA');
    testcase(u128(U128_MAX_BIGINT - 2n), 'BCGDENLQRQWDSLRUGSNLBTMFIJAT');
    testcase(u128(U128_MAX_BIGINT - 1n), 'BCGDENLQRQWDSLRUGSNLBTMFIJAU');
    testcase(u128.MAX, 'BCGDENLQRQWDSLRUGSNLBTMFIJAV');
  });

  test('from string out of range', () => {
    expect(() => Rune.fromString('BCGDENLQRQWDSLRUGSNLBTMFIJAW')).toThrow();
  });

  test('mainnet minimum at height', () => {
    function testcase(height: number, minimum: string) {
      expect(Rune.getMinimumAtHeight(Chain.MAINNET, u128(height)).toString()).toEqual(minimum);
    }

    const START = SUBSIDY_HALVING_INTERVAL * 4;
    const END = START + SUBSIDY_HALVING_INTERVAL;
    const INTERVAL = SUBSIDY_HALVING_INTERVAL / 12;

    testcase(0, 'AAAAAAAAAAAAA');
    testcase(START / 2, 'AAAAAAAAAAAAA');
    testcase(START, 'ZZYZXBRKWXVA');
    testcase(START + 1, 'ZZXZUDIVTVQA');
    testcase(END - 1, 'A');
    testcase(END, 'A');
    testcase(END + 1, 'A');
    testcase(0xffff_ffff, 'A');

    testcase(START + INTERVAL * 0 - 1, 'AAAAAAAAAAAAA');
    testcase(START + INTERVAL * 0 + 0, 'ZZYZXBRKWXVA');
    testcase(START + INTERVAL * 0 + 1, 'ZZXZUDIVTVQA');

    testcase(START + INTERVAL * 1 - 1, 'AAAAAAAAAAAA');
    testcase(START + INTERVAL * 1 + 0, 'ZZYZXBRKWXV');
    testcase(START + INTERVAL * 1 + 1, 'ZZXZUDIVTVQ');

    testcase(START + INTERVAL * 2 - 1, 'AAAAAAAAAAA');
    testcase(START + INTERVAL * 2 + 0, 'ZZYZXBRKWY');
    testcase(START + INTERVAL * 2 + 1, 'ZZXZUDIVTW');

    testcase(START + INTERVAL * 3 - 1, 'AAAAAAAAAA');
    testcase(START + INTERVAL * 3 + 0, 'ZZYZXBRKX');
    testcase(START + INTERVAL * 3 + 1, 'ZZXZUDIVU');

    testcase(START + INTERVAL * 4 - 1, 'AAAAAAAAA');
    testcase(START + INTERVAL * 4 + 0, 'ZZYZXBRL');
    testcase(START + INTERVAL * 4 + 1, 'ZZXZUDIW');

    testcase(START + INTERVAL * 5 - 1, 'AAAAAAAA');
    testcase(START + INTERVAL * 5 + 0, 'ZZYZXBS');
    testcase(START + INTERVAL * 5 + 1, 'ZZXZUDJ');

    testcase(START + INTERVAL * 6 - 1, 'AAAAAAA');
    testcase(START + INTERVAL * 6 + 0, 'ZZYZXC');
    testcase(START + INTERVAL * 6 + 1, 'ZZXZUE');

    testcase(START + INTERVAL * 7 - 1, 'AAAAAA');
    testcase(START + INTERVAL * 7 + 0, 'ZZYZY');
    testcase(START + INTERVAL * 7 + 1, 'ZZXZV');

    testcase(START + INTERVAL * 8 - 1, 'AAAAA');
    testcase(START + INTERVAL * 8 + 0, 'ZZZA');
    testcase(START + INTERVAL * 8 + 1, 'ZZYA');

    testcase(START + INTERVAL * 9 - 1, 'AAAA');
    testcase(START + INTERVAL * 9 + 0, 'ZZZ');
    testcase(START + INTERVAL * 9 + 1, 'ZZY');

    testcase(START + INTERVAL * 10 - 2, 'AAC');
    testcase(START + INTERVAL * 10 - 1, 'AAA');
    testcase(START + INTERVAL * 10 + 0, 'AAA');
    testcase(START + INTERVAL * 10 + 1, 'AAA');

    testcase(START + INTERVAL * 10 + INTERVAL / 2, 'NA');

    testcase(START + INTERVAL * 11 - 2, 'AB');
    testcase(START + INTERVAL * 11 - 1, 'AA');
    testcase(START + INTERVAL * 11 + 0, 'AA');
    testcase(START + INTERVAL * 11 + 1, 'AA');

    testcase(START + INTERVAL * 11 + INTERVAL / 2, 'N');

    testcase(START + INTERVAL * 12 - 2, 'B');
    testcase(START + INTERVAL * 12 - 1, 'A');
    testcase(START + INTERVAL * 12 + 0, 'A');
    testcase(START + INTERVAL * 12 + 1, 'A');
  });

  test('minimum at height', () => {
    function testcase(chain: Chain, height: number, minimum: string) {
      expect(Rune.getMinimumAtHeight(chain, u128(height)).toString()).toEqual(minimum);
    }

    testcase(Chain.TESTNET, 0, 'AAAAAAAAAAAAA');
    testcase(Chain.TESTNET, SUBSIDY_HALVING_INTERVAL * 12 - 1, 'AAAAAAAAAAAAA');
    testcase(Chain.TESTNET, SUBSIDY_HALVING_INTERVAL * 12, 'ZZYZXBRKWXVA');
    testcase(Chain.TESTNET, SUBSIDY_HALVING_INTERVAL * 12 + 1, 'ZZXZUDIVTVQA');

    testcase(Chain.SIGNET, 0, 'ZZYZXBRKWXVA');
    testcase(Chain.SIGNET, 1, 'ZZXZUDIVTVQA');

    testcase(Chain.REGTEST, 0, 'ZZYZXBRKWXVA');
    testcase(Chain.REGTEST, 1, 'ZZXZUDIVTVQA');
  });

  test('reserved', () => {
    expect(RESERVED).toBe(Rune.fromString('AAAAAAAAAAAAAAAAAAAAAAAAAAA').value);
    expect(Rune.getReserved(u128(0)).value).toBe(RESERVED);
    expect(Rune.getReserved(u128(1)).value).toBe(RESERVED + 1n);
  });

  test('is reserved', () => {
    function testcase(rune: string, reserved: boolean) {
      expect(Rune.fromString(rune).reserved).toBe(reserved);
    }

    testcase('A', false);
    testcase('ZZZZZZZZZZZZZZZZZZZZZZZZZZ', false);
    testcase('AAAAAAAAAAAAAAAAAAAAAAAAAAA', true);
    testcase('AAAAAAAAAAAAAAAAAAAAAAAAAAB', true);
    testcase('BCGDENLQRQWDSLRUGSNLBTMFIJAV', true);
  });

  test('steps', () => {
    let i = 0;
    while (true) {
      try {
        const rune = Rune.fromString(_.repeat('A', i + 1));
        expect(rune.value).toBe(Rune.STEPS[i]);

        i++;
      } catch (e) {
        expect(Rune.STEPS.length).toBe(i);
        break;
      }
    }
  });

  test('commitment', () => {
    function testcase(rune: number | u128, bytes: number[]) {
      expect([...new Rune(u128(rune)).commitment]).toEqual(bytes);
    }

    testcase(0, []);
    testcase(1, [1]);
    testcase(255, [255]);
    testcase(256, [0, 1]);
    testcase(65535, [255, 255]);
    testcase(65536, [0, 0, 1]);
    testcase(
      u128.MAX,
      _.range(16).map(() => 255)
    );
  });
});
