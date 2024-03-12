// #[cfg(test)]
// mod tests {
//   use super::*;

//   #[test]
//   fn round_trip() {
//     fn case(n: u128, s: &str) {
//       assert_eq!(Rune(n).to_string(), s);
//       assert_eq!(s.parse::<Rune>().unwrap(), Rune(n));
//     }

//     case(0, "A");
//     case(1, "B");
//     case(2, "C");
//     case(3, "D");
//     case(4, "E");
//     case(5, "F");
//     case(6, "G");
//     case(7, "H");
//     case(8, "I");
//     case(9, "J");
//     case(10, "K");
//     case(11, "L");
//     case(12, "M");
//     case(13, "N");
//     case(14, "O");
//     case(15, "P");
//     case(16, "Q");
//     case(17, "R");
//     case(18, "S");
//     case(19, "T");
//     case(20, "U");
//     case(21, "V");
//     case(22, "W");
//     case(23, "X");
//     case(24, "Y");
//     case(25, "Z");
//     case(26, "AA");
//     case(27, "AB");
//     case(51, "AZ");
//     case(52, "BA");
//     case(u128::MAX - 2, "BCGDENLQRQWDSLRUGSNLBTMFIJAT");
//     case(u128::MAX - 1, "BCGDENLQRQWDSLRUGSNLBTMFIJAU");
//     case(u128::MAX, "BCGDENLQRQWDSLRUGSNLBTMFIJAV");
//   }

//   #[test]
//   fn from_str_out_of_range() {
//     "BCGDENLQRQWDSLRUGSNLBTMFIJAW".parse::<Rune>().unwrap_err();
//   }

//   #[test]
//   #[allow(clippy::identity_op)]
//   #[allow(clippy::erasing_op)]
//   #[allow(clippy::zero_prefixed_literal)]
//   fn mainnet_minimum_at_height() {
//     #[track_caller]
//     fn case(height: u32, minimum: &str) {
//       assert_eq!(
//         Rune::minimum_at_height(Chain::Mainnet, Height(height)).to_string(),
//         minimum,
//       );
//     }

//     const START: u32 = SUBSIDY_HALVING_INTERVAL * 4;
//     const END: u32 = START + SUBSIDY_HALVING_INTERVAL;
//     const INTERVAL: u32 = SUBSIDY_HALVING_INTERVAL / 12;

//     case(0, "AAAAAAAAAAAAA");
//     case(START / 2, "AAAAAAAAAAAAA");
//     case(START, "ZZYZXBRKWXVA");
//     case(START + 1, "ZZXZUDIVTVQA");
//     case(END - 1, "A");
//     case(END, "A");
//     case(END + 1, "A");
//     case(u32::MAX, "A");

//     case(START + INTERVAL * 00 - 1, "AAAAAAAAAAAAA");
//     case(START + INTERVAL * 00 + 0, "ZZYZXBRKWXVA");
//     case(START + INTERVAL * 00 + 1, "ZZXZUDIVTVQA");

//     case(START + INTERVAL * 01 - 1, "AAAAAAAAAAAA");
//     case(START + INTERVAL * 01 + 0, "ZZYZXBRKWXV");
//     case(START + INTERVAL * 01 + 1, "ZZXZUDIVTVQ");

//     case(START + INTERVAL * 02 - 1, "AAAAAAAAAAA");
//     case(START + INTERVAL * 02 + 0, "ZZYZXBRKWY");
//     case(START + INTERVAL * 02 + 1, "ZZXZUDIVTW");

//     case(START + INTERVAL * 03 - 1, "AAAAAAAAAA");
//     case(START + INTERVAL * 03 + 0, "ZZYZXBRKX");
//     case(START + INTERVAL * 03 + 1, "ZZXZUDIVU");

//     case(START + INTERVAL * 04 - 1, "AAAAAAAAA");
//     case(START + INTERVAL * 04 + 0, "ZZYZXBRL");
//     case(START + INTERVAL * 04 + 1, "ZZXZUDIW");

//     case(START + INTERVAL * 05 - 1, "AAAAAAAA");
//     case(START + INTERVAL * 05 + 0, "ZZYZXBS");
//     case(START + INTERVAL * 05 + 1, "ZZXZUDJ");

//     case(START + INTERVAL * 06 - 1, "AAAAAAA");
//     case(START + INTERVAL * 06 + 0, "ZZYZXC");
//     case(START + INTERVAL * 06 + 1, "ZZXZUE");

//     case(START + INTERVAL * 07 - 1, "AAAAAA");
//     case(START + INTERVAL * 07 + 0, "ZZYZY");
//     case(START + INTERVAL * 07 + 1, "ZZXZV");

//     case(START + INTERVAL * 08 - 1, "AAAAA");
//     case(START + INTERVAL * 08 + 0, "ZZZA");
//     case(START + INTERVAL * 08 + 1, "ZZYA");

//     case(START + INTERVAL * 09 - 1, "AAAA");
//     case(START + INTERVAL * 09 + 0, "ZZZ");
//     case(START + INTERVAL * 09 + 1, "ZZY");

//     case(START + INTERVAL * 10 - 2, "AAC");
//     case(START + INTERVAL * 10 - 1, "AAA");
//     case(START + INTERVAL * 10 + 0, "AAA");
//     case(START + INTERVAL * 10 + 1, "AAA");

//     case(START + INTERVAL * 10 + INTERVAL / 2, "NA");

//     case(START + INTERVAL * 11 - 2, "AB");
//     case(START + INTERVAL * 11 - 1, "AA");
//     case(START + INTERVAL * 11 + 0, "AA");
//     case(START + INTERVAL * 11 + 1, "AA");

//     case(START + INTERVAL * 11 + INTERVAL / 2, "N");

//     case(START + INTERVAL * 12 - 2, "B");
//     case(START + INTERVAL * 12 - 1, "A");
//     case(START + INTERVAL * 12 + 0, "A");
//     case(START + INTERVAL * 12 + 1, "A");
//   }

//   #[test]
//   fn minimum_at_height() {
//     #[track_caller]
//     fn case(chain: Chain, height: u32, minimum: &str) {
//       assert_eq!(
//         Rune::minimum_at_height(chain, Height(height)).to_string(),
//         minimum,
//       );
//     }

//     case(Chain::Testnet, 0, "AAAAAAAAAAAAA");
//     case(
//       Chain::Testnet,
//       SUBSIDY_HALVING_INTERVAL * 12 - 1,
//       "AAAAAAAAAAAAA",
//     );
//     case(
//       Chain::Testnet,
//       SUBSIDY_HALVING_INTERVAL * 12,
//       "ZZYZXBRKWXVA",
//     );
//     case(
//       Chain::Testnet,
//       SUBSIDY_HALVING_INTERVAL * 12 + 1,
//       "ZZXZUDIVTVQA",
//     );

//     case(Chain::Signet, 0, "ZZYZXBRKWXVA");
//     case(Chain::Signet, 1, "ZZXZUDIVTVQA");

//     case(Chain::Regtest, 0, "ZZYZXBRKWXVA");
//     case(Chain::Regtest, 1, "ZZXZUDIVTVQA");
//   }

//   #[test]
//   fn serde() {
//     let rune = Rune(0);
//     let json = "\"A\"";
//     assert_eq!(serde_json::to_string(&rune).unwrap(), json);
//     assert_eq!(serde_json::from_str::<Rune>(json).unwrap(), rune);
//   }

//   #[test]
//   fn reserved() {
//     assert_eq!(
//       RESERVED,
//       "AAAAAAAAAAAAAAAAAAAAAAAAAAA".parse::<Rune>().unwrap().0,
//     );

//     assert_eq!(Rune::reserved(0), Rune(RESERVED));
//     assert_eq!(Rune::reserved(1), Rune(RESERVED + 1));
//   }

//   #[test]
//   fn is_reserved() {
//     #[track_caller]
//     fn case(rune: &str, reserved: bool) {
//       assert_eq!(rune.parse::<Rune>().unwrap().is_reserved(), reserved);
//     }

//     case("A", false);
//     case("ZZZZZZZZZZZZZZZZZZZZZZZZZZ", false);
//     case("AAAAAAAAAAAAAAAAAAAAAAAAAAA", true);
//     case("AAAAAAAAAAAAAAAAAAAAAAAAAAB", true);
//     case("BCGDENLQRQWDSLRUGSNLBTMFIJAV", true);
//   }

//   #[test]
//   fn steps() {
//     for i in 0.. {
//       match "A".repeat(i + 1).parse::<Rune>() {
//         Ok(rune) => assert_eq!(Rune(Rune::STEPS[i]), rune),
//         Err(_) => {
//           assert_eq!(Rune::STEPS.len(), i);
//           break;
//         }
//       }
//     }
//   }
// }
