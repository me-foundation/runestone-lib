# runestone-lib

This is a Typescript implementation of the Bitcoin Runestone protocol.
To see the original version, please go to the [Ordinals repo](/ordinals/ord);
you can find various [data structures](/ordinals/ord/tree/master/crates/ordinals/src) and
[indexer implementation](/ordinals/ord/blob/master/src/index/updater/rune_updater.rs) there.
General documentation of the runes protocol and how runestones are used can be found
[here](https://docs.ordinals.com/runes.html).

## Encode Runestone

To encode a runestone, use `encodeRunestone()` method, with an example below:

```ts
import { encodeRunestone } from '@magiceden-oss/runestone-lib';

// To deploy a new rune ticker
// (this will require a commitment in an input script)
const etchingRunestone = encodeRunestone({
  etching: {
    runeName: 'THIS•IS•AN•EXAMPLE•RUNE',
    divisibility: 0,
    premine: 0,
    symbol: '',
    terms: {
      cap: 69,
      amount: 420,
      offset: {
        end: 9001,
      },
    },
    turbo: true,
  },
});

// To mint UNCOMMON•GOODS
const mintRunestone = encodeRunestone({
  mint: {
    block: 1n,
    tx: 0,
  },
});

// Transfer 10 UNCOMMON•GOODS to output 1
const edictRunestone = encodeRunestone({
  edicts: [
    {
      id: {
        block: 1n,
        tx: 0,
      },
      amount: 10n,
      output: 1,
    },
  ],
});
```

## Decode Runestone

Decoding a runestone within a transaction is as simple as passing in
the transaction data from Bitcoin Core RPC server.

```ts
import {
  tryDecodeRunestone,
  isRunestoneArtifact,
  RunestoneSpec,
  Cenotaph
} from '@magiceden-oss/runestone-lib';

// transaction retrieved with getrawtransaction RPC call
const tx = ...;

const artifact = tryDecodeRunestone(tx);

if (isRunestone(artifact)) {
  const runestone: RunestoneSpec = artifact;
  ...
} else {
  const cenotaph: Cenotaph = artifact;
  ...
}
```

## Indexing

To index, initialize a RunestoneIndexer, implement the interface arguments
to RunestoneIndexer constructor. Then it is just a matter of start() to finish
initializing the indexer, and then controlling the rate of syncing indexing
to latest state in RPC server.

```ts
// Initialize indexer
const indexer = new RunestoneIndexer(...);

// Preps the indexer to be ready to run updateRuneUtxoBalances()
await indexer.start()

// Example of a polling job running updateRuneUtxoBalances()
// every minute, with stop cleanup handling
let stop = false;
...

const intervalId = setInterval(async () => {
  try {
    await index.updateRuneUtxoBalances();
  } catch (err) {
    console.error('Error occurred while indexing runes', err);
  }

  if (stop) {
    clearInterval(intervalId);
    await indexer.stop();
  }
}, 60 * 1000 /* one minute */);

```
