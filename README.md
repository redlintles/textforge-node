# TextForge for Node.js

Typed Node.js bindings for the TextForge text-transformation DSL. Binding version
**0.1.0** is based on the published **TextForge 0.2.0** core, using N-API through
`napi-rs`. Both ESM and CommonJS expose the same camelCase API and share class identities, so
objects can cross module formats.

All engine operations go through `textforge::api::portable`. The Rust addon is an
adapter; TypeScript provides the immutable fluent builder, public types and docs.
The bundled core includes documented corrections for numeric assignments,
persistence, output paths and registry-consistent bytecode opcodes. See [core provenance](docs/core.md) and the reviewable
[patch](docs/core-0.2.0.patch).

## Build and try

Requires Node.js 22 or later, npm, and a Rust toolchain capable of building the
locked dependencies. CI uses Rust stable; this checkout was tested with Rust
1.99.1 and Node.js 24.14.1 on Linux x64 with glibc. Native linking requires the
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
const externalId = processor.addTransform(pipeline.compile());
processor.writePipelineToFile(externalId, 'pipelines/example.tft');
processor.writeToBytecodeFile(externalId, 'pipelines/example.tfb');
```

CommonJS:

```js
const { Pipeline } = require('textforge-node');
console.log(new Pipeline().normalizeUnicode('nfc').compile().process('e\u0301'));
```

Every fluent edit returns a **new** plan. Keep the returned value. Compilation
can be repeated and creates independent executables with fresh execution context
per call. `Processor` additionally exposes registration, editable instruction
snapshots, text/bytecode persistence, files, debugging, batches, watchers and
buffered execution. See the complete [API and lifecycle guide](docs/api.md),
[builder mapping](docs/builder-parity.json) and [processor mapping](docs/parity.md).

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
`instruction` and `input`, preserving portable diagnostics. Catch it with
`error instanceof TextForgeError`. Batch methods return an error per failed task
instead of discarding other results. JavaScript boundary type/range violations
raise `TypeError` or `RangeError`.

Numbers must be nonnegative safe integers. Use `bigint` for the full unsigned
64-bit range; the core also checks the target's native-size range. Byte counts
and stream limits return `bigint`. Unpaired UTF-16 surrogates in ordinary strings
are rejected instead of replaced. `FilePath.fromNativeBytes` preserves Unix path
bytes, while `FilePath.fromWindowsWide` preserves Windows UTF-16 code units.
Unsupported foreign-platform path representations raise a portable error.

## Distribution and development

[Compatibility and distribution](docs/compatibility.md) distinguishes locally
verified configurations from CI targets. A binary package is specific to its
OS, architecture and libc. This repository does not publish a universal binary
or automatically download one during installation.

```sh
npm run check:generated
npm run check:reference
python3 scripts/generate-processor-reference.py --check
python3 scripts/check-core.py
npm run test:distribution
python3 scripts/check.py
```

`test:distribution` packs and installs the actual package in a clean temporary
project, then tests ESM, CommonJS and their TypeScript declarations. Add
`--source` to the underlying script to also rebuild a source archive outside the
checkout. CI runs both paths. Generated methods are readable static source;
regeneration commands and freshness checks are committed. Publishing and pushing
remain manual maintainer actions.

Licensed GPL-3.0-only, matching the bundled core. See [LICENSE](LICENSE) and
[Changelog.md](Changelog.md).
