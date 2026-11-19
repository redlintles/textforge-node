# Bundled core provenance

Base: crates.io `textforge` **0.4.0**, upstream revision
`6407329777e5d3c3875e8695ebc2b683f4d4f9e1` (tag `v0.4.0`), as recorded by the
published `.cargo_vcs_info.json`. The addon builds from `vendor/textforge`
directly; it never silently picks up a neighboring core checkout.

The snapshot is the published crate, file for file: library sources, the
`txf`/`txfg` program sources, `docs/txfrc.schema.json` (read by the profile
tests), README, changelog, license, original manifest and VCS metadata. The
registry's `Cargo.lock` is omitted; the adapter's own `Cargo.lock` fixes the
dependency resolution.

**No engine file is edited.** The only difference from the published crate is
`Cargo.toml`: `scripts/check-core.py` derives it from the published
`Cargo.toml.orig` by removing the `[[bin]]`, `[[example]]`,
`[dev-dependencies]` and docs.rs sections and leaving an empty `[workspace]`.
Runtime dependencies and feature names are unchanged.

## Corrections carried by binding 0.1.0

Binding 0.1.0 bundled core 0.2.0 with a reviewable patch. Core 0.3.x and 0.4.0
cover those corrections, or decided them differently, so binding 0.2.0 carries
no patch:

| 0.1.0 correction | Core 0.4.0 |
| --- | --- |
| Scoped replacement-map builder; debug execution binds parameters once and keeps the block | Upstream (`ReplaceMapBuilder`, portable `define_replace_map`) |
| `val`/`var`/`mutv` accept portable numbers | Not upstream: the portable slot takes text. The adapter sends the decimal text, as the Rust builder does (`tests/numeric_assignments.rs`) |
| New pipeline files are created on export; `.tft`/`.tfb` aliases | Upstream (0.4.0 `check_output_file_path`) |
| Missing parent directories of exports, reports, buffer outputs and the spill directory are created | **Not upstream.** The engine reports a persistence error; binding 0.2.0 follows it |
| Text serialization fails explicitly on line breaks | Superseded: 0.3.1 writes `\n`, `\t`, `\r`, `\0` as escapes, so these pipelines round-trip as text |
| `raw`, `rfw`, `null` bytecode opcodes match the registry | Upstream (`tests/persistence.rs` keeps the regression) |

## Verification

[core-provenance.json](core-provenance.json) hashes every bundled file.
`python3 scripts/check-core.py` checks that each file equals the published
crate, that `Cargo.toml` is the derived manifest and that the hashes and
`vendor/CORE_REVISION` match. It downloads nothing; run
`cargo fetch --manifest-path scripts/upstream/Cargo.toml` first, which puts the
published crate in Cargo's registry cache.

## Updating the core

1. Obtain maintainer approval (core `AGENTS.md`, section 17).
2. Set `version` and `revision` in `docs/core-provenance.json`, the exact
   version in `Cargo.toml` and `scripts/upstream/Cargo.toml`, then run
   `cargo fetch --manifest-path scripts/upstream/Cargo.toml` and
   `python3 scripts/check-core.py --update`.
3. Read the core changelog and update the adapter, the generated builder
   (`scripts/generate-builder.py`), both Rust oracles, the parity mappings,
   the compatibility matrix and the documentation.
4. Run `python3 scripts/check.py` and `npm run test:distribution`.
