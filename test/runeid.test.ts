import { RuneId } from '../src/runeid';
import { u128 } from '../src/u128';

describe('runeid', () => {
  test('delta', () => {
    let expected = [
      new RuneId(4, 2),
      new RuneId(1, 2),
      new RuneId(1, 1),
      new RuneId(3, 1),
      new RuneId(2, 0),
    ];

    expected = RuneId.sort(expected);

    expect(expected).toEqual([
      new RuneId(1, 1),
      new RuneId(1, 2),
      new RuneId(2, 0),
      new RuneId(3, 1),
      new RuneId(4, 2),
    ]);

    let previous = new RuneId(0, 0);
    const deltas: [u128, u128][] = [];
    for (const id of expected) {
      const delta = previous.delta(id).unwrap();
      deltas.push(delta);
      previous = id;
    }

    expect(deltas).toEqual([
      [1n, 1n],
      [0n, 1n],
      [1n, 0n],
      [1n, 1n],
      [1n, 2n],
    ]);

    previous = new RuneId(0, 0);
    const actual: RuneId[] = [];
    for (const [block, tx] of deltas) {
      const next = previous.next(block, tx).unwrap();
      actual.push(next);
      previous = next;
    }

    expect(actual).toEqual(expected);
  });

  test('display', () => {
    expect(RuneId.new(1, 2).unwrap().toString()).toBe('1:2');
  });

  test('from string', () => {
    expect(() => RuneId.fromString(':')).toThrow();
    expect(() => RuneId.fromString('1:')).toThrow();
    expect(() => RuneId.fromString(':2')).toThrow();
    expect(() => RuneId.fromString('a:2')).toThrow();
    expect(() => RuneId.fromString('1:a')).toThrow();
    expect(RuneId.fromString('1:2')).toEqual(new RuneId(1, 2));
  });
});
