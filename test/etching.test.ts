import { Etching } from '../src/etching';
import { u128 } from '../src/integer';
import { None, Some, Option } from '../src/monads';
import { Terms } from '../src/terms';

describe('etching', () => {
  const ZERO = u128(0);
  const ONE = u128(1);
  const TWO = u128(2);

  it.each([
    [None, None, Some(ZERO)],
    [Some(ZERO), None, Some(ZERO)],
    [Some(ONE), None, Some(ONE)],
    [Some(ONE), Some({ cap: None, amount: None }), Some(ONE)],
    [None, Some({ cap: None, amount: None }), Some(ZERO)],
    [
      Some(u128(u128.MAX / TWO + ONE)),
      Some({ cap: Some(u128(u128.MAX / TWO)), amount: Some(ONE) }),
      Some(u128.MAX),
    ],
    [Some(u128(1000)), Some({ cap: Some(u128(10)), amount: Some(u128(100)) }), Some(u128(2000))],
    [Some(u128.MAX), Some({ cap: Some(ONE), amount: Some(ONE) }), None as Option<u128>],
    [Some(ZERO), Some({ cap: Some(ONE), amount: Some(u128.MAX) }), Some(u128.MAX)],
  ])('supply', (premine: Option<u128>, terms: Option<Terms>, supply: Option<u128>) => {
    expect(new Etching(None, None, None, None, terms, premine, false).supply).toEqual(supply);
  });
});

//   case(
//     Some(0),
//     Some(Terms {
//       cap: Some(1),
//       amount: Some(u128::MAX),
//       ..default()
//     }),
//     Some(u128::MAX),
//   );
// }
