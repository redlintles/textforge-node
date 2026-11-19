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
| `try_ignore`, `on_line`, `on_chunk`, `on_line_interval` (0.3/0.4) | `tryIgnore`, `onLine`, `onChunk`, `onLineInterval`; `Instruction` or single-instruction `Pipeline` for `impl Into<TokenWrapper>` |
| `pipeline_join`, `write_to_file`, `append_file`, `prepend_file`, `insert_file` (0.3) | `pipelineJoin`, `writeToFile`, `appendFile`, `prependFile`, `insertFile` |
| `get_var` | `getVar`, `Variable` |
| `define_replace_map`, `ReplaceMapBuilder::add_replace/end` | `defineReplaceMap`, scoped `addReplace/end`; `addReplaceRule` for individual rules |
| `block_assoc`, `call_block` | `blockAssoc`, `callBlock`; owned subplans |
| `if_do_contains_each` | `ifDoContainsEach`; owned conditional subplan |
| `add_transform`, registration | `addTransform`, `register` (plans, compiled pipelines or instruction arrays) |
| Removal/existence/listing | `removeTransform`, `transformExists`, `showTransforms`, `listTransforms` |
| Token/text snapshots and cloning | `getTransformVec`, `getTextTransformVec`, `clonePipeline` |
| Text and bytecode persistence | `getPipelineFromFile`, `writePipelineToFile`, `readFromBytecodeFile`, `writeToBytecodeFile` |
| Memory/single/debug execution | `runTransform`, `processAll`, `processSingle`, `processAllWithDebug`, `processSingleWithDebug` |
| File and parallel batches/pools | `processFile`, `processBatch`, `processBatchInPool`, `BatchPool` |
| Watcher registration/scheduling/reporting | `Observers`, `Observation`, `processAllWithWatchers` |
| UTF-8 spool and reader/writer hooks | `PortableBuffer`, `BufferOptions`, `StreamReader`, `StreamWriter` |
| Buffered pipeline/single/file/batch | `processAllBuffered`, `processSingleBuffered`, `processFileBuffered`, `processBatchBuffered` |
| Native paths and feature discovery | `FilePath`, `features()` |
| `with_profile`, `set_profile`, `profile`, `ExecutionProfile`, `Limits` (0.3) | `withProfile`, `setProfile`, `profile`, `ExecutionProfile` |
| `set_pipeline_name`, `pipeline_name` (0.3) | `setPipelineName`, `pipelineName` |
| `BindingError::details` (0.4) | `TextForgeError.kind`, `trace`, `parameters`, `cause`, `hint`, `ignorable`, `report` |

This is functional parity with JavaScript ownership and value types. Public
Rust trait objects are represented by checked owned instruction descriptions.
Production code imports only `api::portable`. Optional engine capabilities are
all enabled; `test_access` is isolated to reference executables.

The builder oracle executes 90 cases against the native public Rust API of the
unmodified 0.4.0 core, covering every fluent method except the five file
builders, plus blocks, conditionals and nested `impl Into<TokenWrapper>` cases
built as Rust trait objects (including a safety limit `try_ignore` does not
ignore). Error cases compare the code and its kind. The file builders read and
write real files in `ts/tests/instructions.test.ts`; `scripts/check-parity.py`
requires both. The processor oracle records 52 results and complete errors from
native public methods and portable-only operations, including 0-based line
errors, persistence, watchers, buffered execution, error details, a profile
limit and pipeline names. Node compares stage, code, message, instruction,
input, kind, cause, hint, ignorable and the uncolored report. Every successful
builder case additionally round-trips through text and bytecode files.
Separate tests cover native paths, short reads/writes, callback failures, cleanup,
consuming failures, reentry and worker isolation; `ts/tests/behavior.test.ts`
combines the 0.3/0.4 instructions with Unicode, watchers, buffers, batches,
persistence and workers. The [development guide](development.md) lists every
suite. Installed packages run the same
Node suites with their pinned fixtures. A Rust test documents the portable
`val`/`var`/`mutv` contract the adapter relies on.

There are no intentionally omitted methods in these public builder/processor
surfaces. `ExecutionProfile::from_rc_file` (`.txfrc`) belongs to the `txf`
program, not to the processor, and is not exposed. The core's own constraints remain visible, including synchronous stream
hooks, implemented watcher scheduling windows, canonical file formats and
experimental buffering semantics. These are described in [the API guide](api.md).
