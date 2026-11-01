# Public API parity

The [builder mapping](builder-parity.json) records every public fluent Rust
method, corresponding camelCase method, mnemonic and effective parameters.
The [processor mapping](processor-parity.json) records the public processor
methods and portable entry points. `scripts/check-parity.py` checks method
presence against the pinned source; generator checks detect source hashes and
stale signatures. New methods fail CI until mapping and fixtures are updated.

| Public Rust capability | Node representation |
| --- | --- |
| `new`, `Default` | `new Processor()` |
| `create_pipeline`, builder `build` | `createPipeline()`, immutable `Pipeline.build()` |
| All `TextForgeBuilderMethods` | Explicit typed camelCase methods, mapped to portable instructions |
| `push_token` | `Pipeline.pushToken(Instruction)` |
| `get_var` | `getVar`, `Variable` |
| `block_assoc`, `call_block` | `blockAssoc`, `callBlock`; owned subplans |
| `if_do_contains_each` | `ifDoContainsEach`; owned conditional subplan |
| `add_transform`, registration | `addTransform`, `register` |
| Removal/existence/listing | `removeTransform`, `transformExists`, `showTransforms`, `listTransforms` |
| Token/text snapshots and cloning | `getTransformVec`, `getTextTransformVec`, `clonePipeline` |
| Text and bytecode persistence | `getPipelineFromFile`, `writePipelineToFile`, `readFromBytecodeFile`, `writeToBytecodeFile` |
| Memory/single/debug execution | `runTransform`, `processAll`, `processSingle`, `processAllWithDebug`, `processSingleWithDebug` |
| File and parallel batches/pools | `processFile`, `processBatch`, `processBatchInPool`, `BatchPool` |
| Watcher registration/scheduling/reporting | `Observers`, `Observation`, `processAllWithWatchers` |
| UTF-8 spool and reader/writer hooks | `PortableBuffer`, `BufferOptions`, `StreamReader`, `StreamWriter` |
| Buffered pipeline/single/file/batch | `processAllBuffered`, `processSingleBuffered`, `processFileBuffered`, `processBatchBuffered` |
| Native paths and feature discovery | `FilePath`, `features()` |

This is functional parity with JavaScript ownership and value types. Public
Rust trait objects are represented by checked owned instruction descriptions.
Production code imports only `api::portable`. Optional engine capabilities are
all enabled; `test_access` is isolated to reference executables.

The builder oracle executes 80 cases against the unmodified published Rust core,
covering every fluent method plus blocks and conditionals. The processor oracle
records 41 results/complete errors from native public methods and portable-only
operations, including line errors, persistence, watchers and buffered execution.
Node compares raw stage, code, message, instruction and input, not display strings.
Separate tests cover native paths, short reads/writes, callback failures, cleanup,
consuming failures, reentry and worker isolation. Installed packages run the same
Node suites with their pinned fixtures. Rust regression tests cover the approved
portable numeric-assignment correction.

There are no intentionally omitted methods in these public builder/processor
surfaces. The core's own constraints remain visible, including synchronous stream
hooks, implemented watcher scheduling windows, exact file-extension checks and
experimental buffering semantics. These are described in [the API guide](api.md).
