# TextForge for Node.js

Typed Node.js bindings for the TextForge text-transformation DSL. Binding version
**0.2.0** (unreleased) bundles the published **TextForge 0.4.0** core
(revision `6407329`) without modifications, using N-API through `napi-rs`. Both
ESM and CommonJS expose the same camelCase API and share class identities, so
objects can cross module formats.

All engine operations go through `textforge::api::portable`. The Rust addon is an
adapter; TypeScript provides the immutable fluent builder, public types and docs.
See [core provenance](docs/core.md). Upgrading from 0.1.0? Read the
**Behavior changes** in the [changelog](Changelog.md) first: line numbers now
count from 0, and exports no longer create missing parent directories.

## Build and try

Requires Node.js 22 or later, npm, and a Rust toolchain capable of building the
locked dependencies (the core declares Rust 1.89 as its minimum). CI uses Rust
stable; this release was tested with Rust 1.97.0 and Node.js 22.23 on Linux x64
with glibc. Native linking requires the
usual platform C/C++ build tools. No browser runtime is supported.

```sh
npm ci
npm run build
npm test
```

To create the installable package from source:

```sh
npm ci
npm pack
```

`npm pack` runs the release/native and TypeScript builds automatically through
`prepack`. Install the resulting `.tgz`, which includes `dist/` and `native.node`.
Consumers of that tarball do not need Rust or TypeScript build tools.

ESM:

```ts
import { Pipeline, Processor, getVar } from 'textforge-node';

const pipeline = new Pipeline()
  .trimBothSides()
  .addToBeginning('🍌 ')
  .addToEnd('!');
console.log(pipeline.compile().process(' é ')); // 🍌 é!

const processor = new Processor();
const id = processor.createPipeline().val('n', 2).repeat(getVar('n')).build();
console.log(processor.processAll(id, 'é')); // éé

// External plans and compiled pipelines can both be attached to a processor.
// The destination directory must exist; the file itself is created.
const externalId = processor.addTransform(pipeline.compile());
processor.writePipelineToFile(externalId, 'pipelines/example.textforge');
processor.writeToBytecodeFile(externalId, 'pipelines/example.textforgebc');
```

Text pipelines use `.textforge` (alias `.tft`); bytecode uses `.textforgebc`
(alias `.tfb`). Line breaks and tabs in parameters round-trip through both
formats. See [API details](docs/api.md).

CommonJS:

```js
const { Pipeline } = require('textforge-node');
console.log(new Pipeline().normalizeUnicode('nfc').compile().process('e\u0301'));
```

Replacement maps use a scoped builder:

```ts
const plan = new Pipeline()
  .defineReplaceMap('animals', map => map
    .addReplace('cat', 'wolf')
    .addReplace('wolf', 'dog')
    .end())
  .executeReplaceMap('animals')
  .addToEnd('!');
console.log(plan.compile().process('cat wolf')); // wolf dog!
```

`end()` closes map configuration; it does not halt the pipeline. The synchronous
callback runs once and is discarded. Empty or unfinished definitions are rejected;
failed callbacks leave the original immutable plan untouched. Async callbacks are
unsupported. The old three-argument `defineReplaceMap` remains available for
compatibility; new single-rule calls can use `addReplaceRule`. See [API details](docs/api.md).

Fixed option sets have literal union types for editor completion:
`normalizeUnicode` accepts `'nfc' | 'nfd' | 'nfkc' | 'nfkd' | Variable`,
`Observers.setBuiltin` accepts the `BuiltinWatcherMetric` union and
`ExecutionProfile.preset` the `ExecutionProfileName` union. The option types are
exported as `NormalizationMode`, `BuiltinWatcherMetric` and
`ExecutionProfileName` for TypeScript consumers. Context references remain supported through `getVar`.

Every fluent edit returns a **new** plan. Keep the returned value. Compilation
can be repeated and creates independent executables with fresh execution context
per call. `Processor` additionally exposes registration, editable instruction
snapshots, text/bytecode persistence, files, debugging, batches, watchers and
buffered execution. See the complete [API and lifecycle guide](docs/api.md),
[parity overview](docs/parity.md), [builder mapping](docs/builder-parity.json) and
[processor mapping](docs/processor-parity.json).

## Skipping failures, sections and files (TextForge 0.3/0.4)

```ts
import { Pipeline } from 'textforge-node';

const plan = new Pipeline()
  .tryIgnore(new Pipeline().deleteSingle(9))          // skipped if it fails
  .onLine('[[__LINES__ - 1]]', new Pipeline().toUppercaseAll())
  .onChunk(0, 1, new Pipeline().addToBeginning('> '));
console.log(plan.compile().process('ab\ncd')); // > ab\nCD
```

`tryIgnore(inner)` runs one instruction and, when it fails, leaves no trace of
it: text, variables, blocks and maps are as before. Safety limits are never
ignored. `onLine`, `onChunk` and `onLineInterval` apply one instruction to a
line, a character range or a line interval. Each takes an `Instruction` or a
single-instruction `Pipeline`. Numeric parameters also accept a `[[ ]]`
expression or `{{ }}` template as text; the engine resolves it when the
instruction runs. **Lines, like characters and words, count from 0.**

`pipelineJoin(path)` runs another pipeline file; `writeToFile`, `appendFile`,
`prependFile` and `insertFile(index, path)` write or read files while the
pipeline runs. Relative paths start from the pipeline file's directory, or the
working directory for plans built in code.

## Errors, profiles and pipeline names

```ts
import { ExecutionProfile, Pipeline, Processor, TextForgeError } from 'textforge-node';

try {
  new Pipeline().deleteSingle(9).compile().process('abc');
} catch (error) {
  if (error instanceof TextForgeError) {
    console.log(error.kind);                // IndexOutOfRange
    console.log(error.parameters[0]);       // { name: 'index', value: '9', written: null }
    console.error(error.report);            // the report the txf program prints
  }
}

const processor = new Processor().withProfile(ExecutionProfile.lowMemory());
const id = processor.register(new Pipeline().addToEnd(' by {{__PIPELINE_NAME__}}'));
processor.setPipelineName(id, 'cleanup');
console.log(processor.processAll(id, 'done')); // done by cleanup
```

Since TextForge 0.4.0 an error carries `kind` (the stable name of its code),
`trace` (outermost first), `parameters`, `cause`, `hint`, `ignorable` and the
plain `report`. Read the fields: the report layout may change. An
`ExecutionProfile` sets the spool threshold and the safety limits
(`maxGeneratedBytes`, `maxIterations`; `null` is unlimited); past a limit an
instruction fails with code 31. Profiles never change results.

## Blocks and instruction descriptions

```ts
import { Instruction, Pipeline } from 'textforge-node';

const pipeline = new Pipeline()
  .blockAssoc('suffix', body => body.addToEnd('!'))
  .callBlock('suffix')
  .iter(2, new Instruction('atb', '🍌'));
console.log(pipeline.compile().process('é')); // 🍌🍌é!
```

`blockAssoc` and `ifDoContainsEach` accept a plan or a callback returning a plan.
Construction callbacks run once and are never retained. `Instruction` accepts a
canonical mnemonic and effective arguments, omitting DSL literals such as `do`,
`assoc` and `times`. String parameters preserve engine interpolation semantics.

## Files, watchers and buffers

```ts
import { BufferOptions, Observers, Pipeline, PortableBuffer, Processor } from 'textforge-node';

const processor = new Processor();
const id = processor.register(new Pipeline().addToEnd('!'));
const observers = new Observers();
try {
  observers.set('characters', observation => String([...observation.current].length));
  observers.scheduleAll('characters');
  processor.processAllWithWatchers(id, 'é', observers, 'report.json');
} finally {
  observers.close();
}

const input = PortableBuffer.fromText('é', new BufferOptions(1024));
const output = processor.processAllBuffered(id, input); // consumes input
try {
  console.log(output.intoString()); // é!; consumes output
} finally {
  output.close();
}
```

All calls are synchronous. Long processing blocks the calling Node thread; use
independent instances in `node:worker_threads` for concurrent JavaScript work.
The engine's file batches use native workers and return ordered per-task results.
Custom watchers and stream hooks execute on the calling Node thread. Reentrant
conflicting native borrows are rejected. Objects cannot be transferred between
workers. Close watchers explicitly when their callbacks capture application
objects, and close buffers/pools when their resources are no longer needed.

## Errors and exact conversions

`TextForgeError` is an `Error` with `stage`, numeric `code`, `message`,
`instruction` and `input`, plus the 0.4.0 details (`kind`, `trace`,
`parameters`, `cause`, `hint`, `ignorable`, `report`), preserving portable
diagnostics. Catch it with
`error instanceof TextForgeError`. Batch methods return an error per failed task
instead of discarding other results. JavaScript boundary type/range violations
raise `TypeError` or `RangeError`.

Numbers must be nonnegative safe integers. Use `bigint` for the full unsigned
64-bit range; the core also checks the target's native-size range. Byte counts
and stream limits return `bigint`. Unpaired UTF-16 surrogates in ordinary strings
are rejected instead of replaced. `FilePath.fromNativeBytes` preserves Unix path
bytes, while `FilePath.fromWindowsWide` preserves Windows UTF-16 code units.
Unsupported foreign-platform path representations raise a portable error.

## Performance

The engine does the same work as in Rust; the binding adds a fixed cost of
about half a microsecond per call and converts texts between UTF-16 and UTF-8
on the way in and out, so large in-memory texts run at roughly 50–70% of native
speed. File batches run at native speed. See [benchmarks](docs/benchmarks.md)
and run `npm run benchmark` on your machine.

## Distribution and development

[Compatibility and distribution](docs/compatibility.md) distinguishes locally
verified configurations from CI targets. A binary package is specific to its
OS, architecture and libc. This repository does not publish a universal binary
or automatically download one during installation.

```sh
python3 scripts/check.py     # full pre-commit matrix
npm run test:distribution    # the packed tarball in a clean project
npm run benchmark            # binding against native Rust
```

`test:distribution` packs and installs the actual package in a clean temporary
project, then tests ESM, CommonJS and their TypeScript declarations. Add
`--source` to the underlying script to also rebuild a source archive outside the
checkout. CI runs both paths. Generated methods are readable static source;
regeneration commands and freshness checks are committed. Publishing and pushing
remain manual maintainer actions. The [development guide](docs/development.md)
describes the layout, every test suite, the generated sources and the release
steps.

## Documentation

| Document | Contents |
| --- | --- |
| [API and lifecycle](docs/api.md) | Every class and method, ownership, errors, profiles |
| [Parity](docs/parity.md), [builder mapping](docs/builder-parity.json), [processor mapping](docs/processor-parity.json) | Rust API ↔ Node API and how parity is tested |
| [Compatibility](docs/compatibility.md) | Supported versions, platforms and distribution checks |
| [Core provenance](docs/core.md) | The bundled core and how to update it |
| [Benchmarks](docs/benchmarks.md) | What the binding costs over native Rust |
| [Development](docs/development.md) | Layout, tests, generators, releases |
| [Changelog](Changelog.md) | Changes per version, behavior changes first |

Licensed GPL-3.0-only, matching the bundled core. See [LICENSE](LICENSE).
