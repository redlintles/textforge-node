# Changelog

## 0.1.0 — Unreleased

### Robustness corrections

- Accept external `Pipeline`, `CompiledPipeline` and instruction arrays in both
  `register` and `addTransform`; reject invalid arguments at the public boundary.
- Share runtime classes and declarations between ESM and CommonJS, preserving
  object identity and interoperability across both import models.
- Create missing pipeline output files, report/buffer destinations and parent
  directories; support canonical `.tft`/`.tfb` aliases without placeholder files.
- Quote text parameters correctly, restore numeric context references on import,
  and report unsupported text values before touching existing destination files.
- Correct replace-all, replace-first and null opcode implementations to match the
  existing registry. Regenerate old exports affected by those incorrect codes.
- Build native and TypeScript outputs automatically on `npm pack` and validate
  the exact tarball in clean consumers with paths containing spaces.
- Add full builder persistence round-trips and regressions for real registration,
  file writes, mixed-module use, argument errors and non-destructive failures.

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
