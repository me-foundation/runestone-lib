import { Chain } from './chain';
import { RESERVED, SUBSIDY_HALVING_INTERVAL } from './constants';
import { u128 } from './u128';
import _ from 'lodash';

export class Rune {
  static readonly STEPS = [
    u128(0n),
    u128(26n),
    u128(702n),
    u128(18278n),
    u128(475254n),
    u128(12356630n),
    u128(321272406n),
    u128(8353082582n),
    u128(217180147158n),
    u128(5646683826134n),
    u128(146813779479510n),
    u128(3817158266467286n),
    u128(99246114928149462n),
    u128(2580398988131886038n),
    u128(67090373691429037014n),
    u128(1744349715977154962390n),
    u128(45353092615406029022166n),
    u128(1179180408000556754576342n),
    u128(30658690608014475618984918n),
    u128(797125955808376366093607894n),
    u128(20725274851017785518433805270n),
    u128(538857146126462423479278937046n),
    u128(14010285799288023010461252363222n),
    u128(364267430781488598271992561443798n),
    u128(9470953200318703555071806597538774n),
    u128(246244783208286292431866971536008150n),
    u128(6402364363415443603228541259936211926n),
    u128(166461473448801533683942072758341510102n),
  ];

  constructor(readonly value: u128) {}

  static getMinimumAtHeight(chain: Chain, height: u128) {
    let offset = u128.saturatingAdd(height, u128(1));

    const INTERVAL = u128(SUBSIDY_HALVING_INTERVAL / 12);

    let startSubsidyInterval = u128(Chain.getFirstRuneHeight(chain));

    let endSubsidyInterval = u128.saturatingAdd(
      startSubsidyInterval,
      u128(SUBSIDY_HALVING_INTERVAL)
    );

    if (offset < startSubsidyInterval) {
      return new Rune(Rune.STEPS[12]);
    }

    if (offset >= endSubsidyInterval) {
      return new Rune(u128(0));
    }

    let progress = u128.saturatingSub(offset, startSubsidyInterval);

    let length = u128.saturatingSub(u128(12n), u128(progress / INTERVAL));
    let lengthNumber = Number(length & 0xffff_ffffn);

    let endStepInterval = Rune.STEPS[lengthNumber];

    let startStepInterval = Rune.STEPS[lengthNumber - 1];

    let remainder = u128(progress % INTERVAL);

    return new Rune(
      u128(
        endStepInterval -
          ((endStepInterval - startStepInterval) * remainder) / INTERVAL
      )
    );
  }

  get reserved(): boolean {
    return this.value >= RESERVED;
  }

  static getReserved(n: u128): Rune {
    return new Rune(u128.checkedAdd(RESERVED, n).unwrap());
  }

  toString() {
    let n = this.value;

    if (n === u128.MAX) {
      return 'BCGDENLQRQWDSLRUGSNLBTMFIJAV';
    }

    n = u128(n + 1n);
    let symbol = '';
    while (n > 0) {
      symbol = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Number((n - 1n) % 26n)] + symbol;
      n = u128((n - 1n) / 26n);
    }

    return symbol;
  }

  static fromString(s: string) {
    let x = u128(0);
    for (const i of _.range(s.length)) {
      const c = s[i];

      if (i > 0) {
        x = u128(x + 1n);
      }
      x = u128.checkedMultiply(x, u128(26)).unwrap();
      if ('A' <= c && c <= 'Z') {
        x = u128
          .checkedAdd(x, u128(c.charCodeAt(0) - 'A'.charCodeAt(0)))
          .unwrap();
      } else {
        throw new Error(`invalid character in rune name: ${c}`);
      }
    }

    return new Rune(x);
  }
}
