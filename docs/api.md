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

For instruction-valued parameters, fluent methods accept an `Instruction`, a
single-instruction `Pipeline`, or a `Variable`. Adapter tree recursion is bounded
at 32 levels before native conversion; core rules may impose a smaller limit.
Invalid arity, types, ancestry and runtime variables remain core responsibilities.

## Processor

`new Processor()` exposes the methods in [the parity matrix](parity.md).
`createPipeline()` binds a new plan to this processor. Registering, cloning or
importing returns an owned ID. `getTransformVec` returns independent descriptions
which may be edited by constructing new instructions and re-registered through
`addTransform`; `getTextTransformVec` returns canonical instruction strings.
`removeTransform` removes only the registered snapshot. Compiled executables and
source plans remain independent.

Text exports retain the 0.2.0 core's requirement for an **existing destination
with `.textforge` extension**. Bytecode imports require `.textforgebc`. Bytecode
exports accept the core's recognized pipeline extensions. Import/export behavior
is not rewritten by the adapter. `processFile` writes transformed UTF-8 text.
Debug methods and `showTransforms` print to native stdout.

`FileTask` is `{input, pipelineId, output}`. `processBatch(tasks)` and
`processBatchInPool(pool,tasks)` return `(TextForgeError | null)[]` in task order.
Success is `null`; tasks may use different IDs. Use distinct output paths.
`new BatchPool(threads=0)` creates reusable workers; zero selects automatic sizing.
`close()` is idempotent; closed pools reject subsequent work.

## Paths

`Path` accepts a string, `FilePath` or Unix `Uint8Array`/`Buffer`.
`FilePath.fromText`, `fromNativeBytes`, `fromWindowsWide`, `toText`,
`toNativeBytes`, `toWindowsWide` mirror the portable API. `toText()` is `null`
when a native name has no exact Unicode representation. Raw Windows wide paths
are passed explicitly as `Uint16Array`, preserving unpaired native code units.
Ordinary strings must be well-formed Unicode.

## Watchers

`new Observers()` owns registrations and their callback references. `set(name,fn)`
replaces a custom callback, and `setBuiltin(name,metric)` uses a built-in metric;
`Observers.builtinNames()` lists all core metrics. `scheduleAll(name)`, `reset()`,
`run(observation)` and `writeReport(path)` mirror the portable methods.

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
spooling placement, not a global memory cap. Some core transforms materialize.
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
`close()` is idempotent and releases spill files immediately. GC also drops Rust
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
