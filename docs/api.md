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
single-instruction `Pipeline`, or a `Variable`. Adapter tree recursion is bounded
at 32 levels before native conversion; core rules may impose a smaller limit.
Invalid arity, types, ancestry and runtime variables remain core responsibilities.

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

Pipeline exports create the destination and any missing parent directories.
Text paths accept `.textforge` or `.tft`; bytecode imports accept
`.textforgebc` or `.tfb`. Bytecode exports retain acceptance of the core's recognized pipeline
extensions; use `.tfb` for clarity. Text serialization quotes whitespace, empty
arguments, quotes and backslashes, including nested instructions. Literal line
breaks and variable names outside the textual reference grammar require bytecode
export, which preserves them losslessly. These text limitations are reported
before a destination is created or an existing file is truncated. `processFile`
writes transformed UTF-8 text.
Debug methods and `showTransforms` print to native stdout.

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
`run(observation)` and `writeReport(path)` mirror the portable methods. Report
exports create missing parent directories.

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
spooling placement, not a global memory cap. The spill directory is created when
those options are used to construct or process a buffer. Some core transforms
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
`writeToFile(path)` creates missing parent directories. `close()` is idempotent
and releases spill files immediately. GC also drops Rust
resources, but its timing is unspecified.

## Runtime and errors

Instances belong to the creating Node environment. There is no shared-handle
transfer API; worker threads create independent instances. Calls are synchronous
and keep inputs alive until completion. Compiled pipelines are immutable, but no
cross-worker JavaScript object-sharing guarantee is made. No custom transform
callback API is added; the core's registered instructions remain authoritative.

`TextForgeError` preserves all five portable fields and inherits `Error`.
`stage` is `conversion`, `validation`, `execution`, `persistence` or `callback`.
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
