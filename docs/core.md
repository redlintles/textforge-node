# Bundled core provenance

Base: crates.io `textforge` **0.2.0**, upstream revision
`c2ed4b8f4c96c9e3ddc53576a3cdbf6ccd38bc9e`, as recorded by the published
`.cargo_vcs_info.json`. The addon uses `vendor/textforge` directly; it never
silently picks up a neighboring core checkout. Binding version remains 0.1.0.

The snapshot includes the published library `src`, license, README, original
manifest and VCS metadata. Large sample datasets, upstream integration suites,
benchmarks and documentation assets are omitted. The effective manifest is
library-only, derived from the published original before its binary declarations,
with its own empty workspace. Runtime dependencies and production feature names
are unchanged. `Cargo.lock` fixes the adapter's dependency resolution.

The reviewable [core-0.2.0.patch](core-0.2.0.patch) records the original approved
numeric-assignment correction and the persistence corrections requested after
real Node usage exposed failures:

- The scoped replacement-map API stages rules through the portable layer. Debug
  execution binds parameters once and inspects the real block name without
  removing it from the execution context.
- Numeric values in portable `val`, `var` and `mutv` match the public builder's
  native-size check and decimal-text normalization.
- Pipeline output validation handles new files separately from input validation;
  parents are created after validation, without canonicalizing a missing output.
  The `.tft` and `.tfb` aliases work for the corresponding text and bytecode
  import/export formats, matching the extensions the upstream core recognizes.
- Unresolved text serialization uses registry syntax and shell quoting, and text
  parsing recognizes references in numeric and instruction-valued slots. Text
  limitations (line breaks and unsupported reference names) return explicit
  serialization errors recommending bytecode. Encoding completes before opening
  a destination, preserving existing content on serialization failure.
- Buffered file exports and watcher reports create missing parent directories;
  buffer operations also create a configured spill directory when needed.
- `raw`, `rfw` and `null` opcode implementations match the existing registry.
  Neither the bytecode layout nor registered opcode assignments are changed.

Old bytecode files exported with incorrect replace/null opcode implementations
must be regenerated from their original plans. An incorrectly encoded opcode
cannot reveal which instruction its original author intended.

All production adapter calls still use `api::portable`; shared path, parser and
serialization fixes live in the bundled core. The approved Rust `define_replace_map` signature now takes a scoped closure;
the old single-rule operation is `add_replace_rule`. Canonical file extensions
and runtime dependencies remain unchanged.

[core-provenance.json](core-provenance.json) hashes every bundled file.
`python3 scripts/check-core.py` verifies the snapshot, recorded source revision
and the exact patch against the published crate. It downloads nothing; run
`cargo fetch --manifest-path scripts/upstream/Cargo.toml` if its independent
upstream reference has not been fetched. The 81 builder reference cases execute native public Rust methods in the
**documented patched snapshot**, including the new scoped API absent from the
published baseline. The processor reference
uses native public methods plus portable-only errors from the patched snapshot.
The numeric and persistence regressions cover these corrections directly through
the production portable API; Node also round-trips all 81 builder references
through both file formats.

To update the core: obtain maintainer approval, replace the snapshot, review and
regenerate the patch/provenance, update the compatibility matrix and all parity
mappings, regenerate both Rust oracles and run the complete validation workflow.
