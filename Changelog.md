# Changelog

## 0.1.0 — Unreleased

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
