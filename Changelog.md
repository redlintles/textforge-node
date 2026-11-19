# Changelog

## 0.2.0 — Unreleased

Moves the bundled core from TextForge 0.2.0 straight to the published **0.4.0**
(core 0.3.x was never bundled). The engine is now unmodified.

### Behavior changes

Read these before upgrading; they come from the core.

- **Line numbers count from 0** (core 0.3.2), like characters and words:
  `deleteLine`, `deleteLinesAfter`, `deleteLinesBefore`, `deleteLinesInterval`,
  `selectLines`, `insertLine`, `replaceLine` and the new `onLine` and
  `onLineInterval`. Subtract one from each line number in existing code, text
  pipelines and bytecode. Line ranges clamp an end past the last line.
- **Exports no longer create missing parent directories.** Binding 0.1.0
  patched its core to create them; 0.4.0 creates the file only. A missing
  directory is a `persistence` error for `writePipelineToFile`,
  `writeToBytecodeFile`, watcher reports, `PortableBuffer.writeToFile` and the
  spill directory of `BufferOptions`. `processFile` and the batches still
  create the output's parents.
- **Line breaks round-trip through `.textforge` files** (core 0.3.1): they are
  written as `\n`, `\t`, `\r`, `\0` escapes inside double quotes. Exporting such a
  pipeline as text used to fail; inside double quotes in a hand-written
  `.textforge` file, these escapes are now control characters.
- `writeToBytecodeFile` requires a bytecode extension (`.textforgebc`, `.tfb`).
- **Safety limits**: `rpt`, `padl`, `padr` and `iter` stop at 2 GiB of output
  and 10,000,000 iterations by default, with code 31 (`LimitExceededError`).
  Raise or remove them with an `ExecutionProfile`.
- Error messages are rewritten in English with the offending value and a
  suggested fix (core 0.3.1); match `code` or `kind`, not the text.
- Interpolation keeps stray `{{`, `}}`, `[[`, `]]` that form no variable read or
  expression; `end` inside a block or `iter` stops only that block or loop; a
  `val` cannot be defined twice; expression results must be integers or text
  (core 0.3.2). See the core changelog for the complete list.
- `val`, `var` and `mutVar` send integer values as their decimal text, as the
  Rust builder does: the portable slot takes text. `getTransformVec` shows
  `'2'` for `val('n', 2)`, as before.

### Added

- `tryIgnore(inner)` (`tryi`): run one instruction and skip it, leaving no
  trace, when it fails. Safety limits are never ignored.
- `onLine`, `onChunk`, `onLineInterval` (`onln`, `onck`, `onlni`): apply one
  instruction to a line, a character range or a line interval.
- `pipelineJoin`, `writeToFile`, `appendFile`, `prependFile`, `insertFile`
  (`ppjn`, `wtf`, `apf`, `ppf`, `inf`).
- Numeric parameters accept `[[ ]]` expressions and `{{ }}` templates as text,
  and pipelines can read the built-in variables (`__LINES__`,
  `__LEN_CHARS__`, `__COUNTER__`, `__PIPELINE_NAME__`, …).
- `TextForgeError` (and batch errors) gain `kind`, `trace`, `parameters`,
  `cause`, `hint`, `ignorable` and `report`; `TraceFrame`, `ErrorParameter`
  and `TextForgeErrorData` types.
- `ExecutionProfile` with the `balanced`, `lowMemory` and `fast` presets,
  `withLimits` and `unlimited`; `Processor.setProfile`, `withProfile`,
  `profile`; the `ExecutionProfileName` type.
- `Processor.setPipelineName` and `pipelineName`.

### Performance

- Strings are checked for unpaired surrogates with `isWellFormed` instead of a
  regular expression: about 14 times faster on large inputs, 35 → 56 MiB/s on
  16 MiB in the benchmark. Behavior is unchanged.

### Maintenance

- The core snapshot is the crates.io crate file for file, with a derived
  library-only manifest; `scripts/check-core.py` verifies it and regenerates
  the hashes with `--update`. `docs/core-0.2.0.patch` is removed.
- Both Rust oracles are regenerated from 0.4.0: 90 builder cases (nested
  instructions as Rust trait objects, error kinds) and 52 processor cases
  comparing every error field. The installed-package check exercises the new
  surface in ESM, CommonJS and both TypeScript module kinds.
- New suites: `errors`, `profiles`, `instructions` and `behavior` (the new
  instructions with Unicode, the one-level nesting rule, watchers, buffers,
  batches, persistence and workers).
- `npm run benchmark` compares the binding with the native core
  (`examples/benchmark_native.rs`); results and analysis in
  `docs/benchmarks.md`.
- New `docs/development.md` (layout, suites, generated sources, release
  steps) and a documentation index in the README.

## 0.1.0 — 2026-11-10

### Documentation

- README: state the tracked core revision, use the canonical `.textforge` and
  `.textforgebc` extensions in examples and list their aliases, and link the
  processor mapping (`docs/processor-parity.json`) correctly.
- Changelog: give the initial binding entries their own heading and describe
  `.tft`/`.tfb` as aliases rather than canonical extensions.

### Scoped replacement maps and debug execution

- Add `defineReplaceMap(name, configure)` and the typed `ReplaceMapBuilder`
  methods `addReplace(pattern, replacement)` and `end()`.
- Preserve three-argument calls and expose `addReplaceRule` for individual rules.
- Stage definitions atomically through the portable API and test callback errors,
  lifetime, synchronous-only configuration, ordered rules and persistence.
- Fix debug block lookup to resolve the actual configured name once, preserving
  context inspection and matching regular execution, including interpolated names.

### Export filename compatibility

- Accept the same text/bytecode extensions as the upstream core: `.textforge`
  and `.tft` for text, `.textforgebc` and `.tfb` for bytecode. The `.txf` and
  `.txb` aliases added earlier in this cycle were removed before release because
  the upstream core does not recognize them; a regression test rejects them.
- Exercise the reported normalization/block/export script against the installed
  tarball, creating both output files without placeholders.

### Precise TypeScript options

- Expose normalization modes and built-in watcher metrics as generated literal
  unions, including typed `Observers.builtinNames()` results.
- Preserve explicit execution-context variables for Unicode normalization and
  free-form text for parameters whose values are not a closed set.
- Verify accepted and rejected arguments in source and installed ESM/CommonJS
  consumers, with generated declarations tied to the pinned core's option sets.

### Robustness corrections

- Accept external `Pipeline`, `CompiledPipeline` and instruction arrays in both
  `register` and `addTransform`; reject invalid arguments at the public boundary.
- Share runtime classes and declarations between ESM and CommonJS, preserving
  object identity and interoperability across both import models.
- Create missing pipeline output files, report/buffer destinations and parent
  directories; support the `.tft`/`.tfb` aliases without placeholder files.
- Quote text parameters correctly, restore numeric context references on import,
  and report unsupported text values before touching existing destination files.
- Correct replace-all, replace-first and null opcode implementations to match the
  existing registry. Regenerate old exports affected by those incorrect codes.
- Build native and TypeScript outputs automatically on `npm pack` and validate
  the exact tarball in clean consumers with paths containing spaces.
- Add full builder persistence round-trips and regressions for real registration,
  file writes, mixed-module use, argument errors and non-destructive failures.

### Initial bindings

- Add N-API bindings based on published TextForge 0.2.0 with all production
  features: bytecode, watchers and buffered processing.
- Add TypeScript APIs and declarations for ESM and CommonJS, an immutable
  camelCase fluent builder, owned instruction descriptions, variables, blocks,
  conditional groups and reusable compiled pipelines.
- Expose the complete portable processor, native paths, reusable pools, ordered
  batches, custom/built-in watchers, UTF-8 spools and synchronous stream hooks.
- Preserve portable error diagnostics, exact integer conversions and Unicode;
  reject lossy boundary inputs and conflicting callback reentry.
- Include the maintainer-approved portable numeric assignment correction in the
  bundled core, matching native builder behavior for val, var and mut_var.
- Add Rust and Node parity tests, source provenance checks, installed-package and
  source-rebuild validation, compatibility documentation and CI.
