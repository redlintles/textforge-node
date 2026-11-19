# API and ownership

The package exports named values in both module formats. All methods below use
camelCase and delegate execution to the portable core. Declarations and JSDoc
ship with the package. Integer inputs accept safe `number` or `bigint`; byte
counts return `bigint`.

## Construction

- `new Variable(name)` / `getVar(name)`: explicit context reference.
- `new Instruction(mnemonic, ...arguments)`: immutable owned description with
  `name` and `arguments`. Nested instructions are supported; mutable argument
  arrays are copied. Descriptions do not execute JavaScript callbacks.
- `new Pipeline(...instructions)`: immutable plan. Every builder method returns
  another plan. The complete [method mapping](builder-parity.json) comes from the
  pinned public Rust builder. `add(name, ...args)` accepts any registered mnemonic;
  `pushToken(instruction)` appends a description.
- `block(name, body)` / `blockAssoc(name, body)`: reusable block definition.
- `containsEach(pattern, body)` / `ifDoContainsEach(pattern, body)`: condition
  re-evaluated before each child, preserving Rust behavior.
- `callBlock(name)`: block invocation.
- `compile()`: repeatable structural validation and independent `CompiledPipeline`.
- `build(processor?)`: register a snapshot and return its new ID. Processor-created
  plans remember the processor; standalone plans require an argument.
- `CompiledPipeline.process(input)`: independent owned result with a fresh context.

Parameters with fixed options use exported literal unions:

```ts
import {Pipeline, Observers, getVar} from 'textforge-node';
import type {NormalizationMode, BuiltinWatcherMetric} from 'textforge-node';

const mode: NormalizationMode = 'nfkc'; // 'nfc' | 'nfd' | 'nfkc' | 'nfkd'
new Pipeline().normalizeUnicode(mode);
new Pipeline().normalizeUnicode(getVar('mode')); // Runtime context reference.

const metric: BuiltinWatcherMetric = 'word_count';
const observers = new Observers();
observers.setBuiltin('words', metric);
observers.close();
```

`normalizeUnicode(mode: NormalizationMode | Variable)` suggests all four exact,
case-sensitive modes. A context-selected mode uses `Variable`/`getVar`; an arbitrary
TypeScript `string` must be narrowed to `NormalizationMode` before this call.
`Observers.setBuiltin` accepts the fifteen core names exposed by the
`BuiltinWatcherMetric` union, and `Observers.builtinNames()` returns that typed
list. Other text parameters and custom watcher names remain free-form strings.
These declarations are generated from the pinned core and checked for freshness;
runtime validation remains in the engine, including for plain JavaScript callers.

For instruction-valued parameters, fluent methods accept an `Instruction`, a
single-instruction `Pipeline`, or a `Variable`. Methods whose Rust parameter is
`impl Into<TokenWrapper>` (`tryIgnore`, `onLine`, `onChunk`, `onLineInterval`)
take an `Instruction` or a single-instruction `Pipeline` only, as in Rust. Adapter tree recursion is bounded
at 32 levels before native conversion; core rules may impose a smaller limit.
Invalid arity, types, ancestry and runtime variables remain core responsibilities.

Numeric parameters (`NumberArgument`) take a safe integer, a `bigint`, a
`Variable`, or text holding a `[[ ]]` expression or `{{ }}` template, such as
`deleteLine('[[__LINES__ - 1]]')`. The engine resolves the text when the
instruction runs and rejects anything that does not give an integer (plain
digits such as `'2'` are not an expression). `val`, `var` and `mutVar` store an
integer value as its decimal text, as the Rust builder does. Line numbers,
like character and word indices, count from 0 (TextForge 0.3.2).

### Instructions added by TextForge 0.3 and 0.4

| Method | Mnemonic | What it does |
| --- | --- | --- |
| `tryIgnore(inner)` | `tryi` | Runs `inner`; if it fails, skips it and leaves no trace (text, variables, blocks, maps, `end`). Safety limits are never ignored. The debug methods show each ignored error. |
| `onLine(line, inner)` | `onln` | Applies `inner` to one line. |
| `onChunk(start, end, inner)` | `onck` | Applies `inner` to a character range; an end past the text is clamped. |
| `onLineInterval(start, end, inner)` | `onlni` | Applies `inner` once to a line interval. |
| `pipelineJoin(path)` | `ppjn` | Runs a pipeline file at this point. A processor reads the file when the plan is registered (a missing file is a `persistence` error); a compiled plan reads it when it runs. |
| `writeToFile(path)` | `wtf` | Writes the current text to a file (replaced atomically). |
| `appendFile(path)` / `prependFile(path)` | `apf` / `ppf` | Adds a file's content at the end or the beginning. |
| `insertFile(index, path)` | `inf` | Inserts a file's content at a character index (0 inserts at the start). |

Relative file paths start from the directory of the pipeline file, or from the
working directory for plans built in code. The pipeline itself can read the
built-in variables of the execution context, such as `__LINES__`,
`__LEN_CHARS__`, `__COUNTER__` inside `iter` and `__PIPELINE_NAME__`.

## Processor

`new Processor()` exposes the methods in [the parity matrix](parity.md).
Both `register(source)` and `addTransform(source)` accept a `Pipeline`, a
`CompiledPipeline`, or a readonly array of `Instruction` objects, and return a
fresh registered ID. Registration preserves the source for reuse; compiled
pipelines retain a detached immutable source snapshot for this purpose. Passing
an ID returned by `build()` is unnecessary: that ID already identifies a registered
pipeline. Unsupported input shapes raise a descriptive `TypeError` before native
conversion. ESM and CommonJS use the same classes and may exchange these objects.
`createPipeline()` binds a new plan to this processor. Registering, cloning or
importing returns an owned ID. `getTransformVec` returns independent descriptions
which may be edited by constructing new instructions and re-registered through
`addTransform`; `getTextTransformVec` returns canonical instruction strings.
`removeTransform` removes only the registered snapshot. Compiled executables and
source plans remain independent.

Pipeline exports create the destination file but not its directory: a missing
parent directory is a `persistence` error (TextForge 0.4.0; binding 0.1.0
created it). Text paths accept `.textforge` or `.tft`; bytecode paths accept
`.textforgebc` or `.tfb`, and `writeToBytecodeFile` rejects text extensions.
Text serialization quotes whitespace, empty arguments, quotes and backslashes,
including nested instructions, and writes line breaks, tabs, carriage returns
and NUL as escapes inside double quotes, so they round-trip. A failed export
leaves an existing file unchanged. `processFile` and the file batches write
transformed UTF-8 text and create the output's missing parent directories.
Debug methods and `showTransforms` print to native stdout.

`setProfile(profile)`, the fluent `withProfile(profile)` (the Rust consuming
`with_profile`) and `profile()` set and read the `ExecutionProfile` of later
runs. `setPipelineName(id, name)` and `pipelineName(id)` set and read the name a
registered pipeline sees as `{{__PIPELINE_NAME__}}`; it defaults to the
identifier, or to the file name for imported pipelines.

## Execution profiles

`ExecutionProfile` mirrors Rust `ExecutionProfile` and `Limits` as a frozen value:

- `spoolThreshold: bigint`: the size above which buffered processing keeps a
  document on disk.
- `maxGeneratedBytes: bigint | null`: limit for the text `rpt`, `padl` and
  `padr` produce (default 2 GiB).
- `maxIterations: bigint | null`: limit for the `iter` count (default
  10,000,000). `null` means unlimited.

Create one with `new ExecutionProfile({spoolThreshold, maxGeneratedBytes?,
maxIterations?})`, or use the core presets `ExecutionProfile.balanced()` (the
default, 1 MiB), `lowMemory()` (64 KiB), `fast()` (256 MiB) and
`ExecutionProfile.preset(name: ExecutionProfileName)`. `withLimits({...})` and
`unlimited()` return copies; `equals(other)` compares values. Past a limit an
instruction fails with `LimitExceededError` (code 31), which `tryIgnore` never
ignores. Profiles never change results. Reading `.txfrc` files is a `txf`
feature and is not exposed.

`FileTask` is `{input, pipelineId, output}`. `processBatch(tasks)` and
`processBatchInPool(pool,tasks)` return `(TextForgeError | null)[]` in task order.
Success is `null`; tasks may use different IDs. Use distinct output paths.
`new BatchPool(threads=0)` creates reusable workers; zero selects automatic sizing.
`close()` is idempotent; closed pools reject subsequent work.

## Paths

`Path` accepts a string, file `URL`, `FilePath` or Unix `Uint8Array`/`Buffer`.
`FilePath.fromText`, `fromNativeBytes`, `fromWindowsWide`, `toText`,
`toNativeBytes`, `toWindowsWide` mirror the portable API. `toText()` is `null`
when a native name has no exact Unicode representation. Raw Windows wide paths
are passed explicitly as `Uint16Array`, preserving unpaired native code units.
Ordinary strings must be well-formed Unicode.

## Watchers

`new Observers()` owns registrations and their callback references. `set(name,fn)`
replaces a custom callback, and `setBuiltin(name,metric)` uses a built-in metric;
`Observers.builtinNames()` lists all core metrics. `scheduleAll(name)`, `reset()`,
`run(observation)` and `writeReport(path)` mirror the portable methods. The
report's directory must exist.

`Observation` contains `current`, `before`, optional `after`, and `instruction`.
The observation object passed to a callback is a frozen owned snapshot. Callbacks
must synchronously return a well-formed string. Exceptions become the portable
callback failure (stage `callback`, code 27). Promises are rejected. The engine
preserves an existing report on failure; prior completed observations may remain
until `reset()`. Successful watched runs reset results while retaining callbacks.

Native borrow guards reject reentry that conflicts with a running processor,
watcher or buffer call. A callback may operate on independent objects. Neither
watchers nor foreign callbacks run inside the batch worker pool. `close()`
releases registrations and callbacks; `closed` reports state. Explicitly close
watchers, especially when callbacks capture the watcher itself or its processor:
persistent native callback references cannot be discovered as JavaScript cycles.

## Buffered documents and synchronous streams

`new BufferOptions(memoryThreshold=8388608, spillDirectory=os.tmpdir())` selects
spooling placement, not a global memory cap. The spill directory must exist. Some core transforms
materialize.
`PortableBuffer.fromText`, `fromFile` and `fromReader` construct owned UTF-8
buffers. `lenBytes`, `isEmpty`, `isSpilled`, `spill`, `readAt(offset,maximum)`,
`copyTo(writer)`, `writeToFile(path)`, `intoString`, `close`, and `closed` expose
the complete portable buffer surface. Ranges are bytes, so reads may split UTF-8
sequences. `readAt` beyond EOF returns empty bytes.

A `StreamReader` is `(maximum: bigint) => Uint8Array`; empty means EOF. The core
checks maximum counts and UTF-8 across partial reads. A `StreamWriter` is
`(bytes: Buffer) => number | bigint`; it returns the accepted count. The core
retries partial writes and rejects invalid counts. These are synchronous hooks,
not Node's asynchronous `Readable`/`Writable` protocols. Hook exceptions become
core stream execution errors. Hooks are retained only for the call, and input
and output byte data are copied at the boundary.

`processAllBuffered(id,buffer)` and `processSingleBuffered(textualInstruction,buffer)`
consume input **including failure paths**. `intoString()` also consumes. Further
access raises an error. `processFileBuffered(id,path,options?)` creates an owned
result; `processBatchBuffered([{pipelineId,input}],options?)` returns an ordered
array of `PortableBuffer | TextForgeError`. Close results you do not consume.
`writeToFile(path)` requires an existing directory. `close()` is idempotent
and releases spill files immediately. GC also drops Rust
resources, but its timing is unspecified.

## Runtime and errors

Instances belong to the creating Node environment. There is no shared-handle
transfer API; worker threads create independent instances. Calls are synchronous
and keep inputs alive until completion. Compiled pipelines are immutable, but no
cross-worker JavaScript object-sharing guarantee is made. No custom transform
callback API is added; the core's registered instructions remain authoritative.

`TextForgeError` preserves all portable fields and inherits `Error`.
`stage` is `conversion`, `validation`, `execution`, `persistence` or `callback`.
The TextForge 0.4.0 details are fields too:

| Field | Content |
| --- | --- |
| `kind` | Stable name of the code (`IndexOutOfRange`). |
| `trace` | `TraceFrame[]`, outermost first; the last frame failed. Each has `instruction`, `location` (`file:line` or `null`) and `note` (`null` or what the container was doing, such as the iteration). |
| `parameters` | `ErrorParameter[]` of the failing instruction: `name`, the `value` it ran with, and `written` (`null` unless it was written differently, as an expression or template). |
| `cause` | The lower-level error (I/O, regex), or `null`. |
| `hint` | A general suggestion for the code, or `null`. |
| `ignorable` | Whether `tryIgnore` would ignore it; `false` only for safety limits. |
| `report` | The uncolored report `txf` prints. Its layout may change; read the fields. |

Errors that do not come from a running instruction have an empty trace and
parameters. Batch results carry the same fields. Safety limits use code 31
(`LimitExceededError`); before TextForge 0.4.0 they were code 20.
The adapter never parses terminal-formatted engine error text. Boundary type,
Unicode, numeric and closed-resource errors use normal JavaScript exceptions.
`features()` reports enabled production features; `version` and `coreVersion`
identify the binding and core base version.

## Replacement-map configuration

`Pipeline.defineReplaceMap(name, configure)` supplies a scoped `ReplaceMapBuilder`.
Call `addReplace(pattern, replacement)` in priority order, then `end()`. The
callback must complete synchronously and return `undefined` (as `end()` does).
Rules use the engine's regex/capture semantics and normal variable interpolation.
The scope cannot be reused after return. Configuration failures append nothing;
`end()` emits no halt instruction. Empty definitions fail portable validation.
Maps execute only when `executeReplaceMap(name)` is reached, using non-cascading
replacement. Single-rule calls use `addReplaceRule(name, pattern, replacement)`;
the earlier three-argument `defineReplaceMap` overload is retained and deprecated.
