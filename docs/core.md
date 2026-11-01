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

The maintainer explicitly authorized the single production correction in
[core-0.2.0.patch](core-0.2.0.patch). Numeric literal arguments in the value slot
of portable `val`, `var` and `mutv` are checked against the native integer range
and converted to decimal text, exactly as the public Rust builder does. Previously
the portable path rejected them because the textual registry describes that slot
as String. Normalization belongs to the shared portable layer, and the binding
has no instruction-specific workaround. No public Rust signatures are changed.

[core-provenance.json](core-provenance.json) hashes every bundled file.
`python3 scripts/check-core.py` verifies the snapshot, recorded source revision
and the exact patch against the published crate. It downloads nothing; run
`cargo fetch --manifest-path scripts/upstream/Cargo.toml` if its independent
upstream reference has not been fetched. The 80 builder reference cases are
executed against the **unmodified published crate**, while the processor reference
uses native public methods plus portable-only errors from the patched snapshot.
The numeric regression also verifies rejection of unrelated numeric String slots.

To update the core: obtain maintainer approval, replace the snapshot, review and
regenerate the patch/provenance, update the compatibility matrix and all parity
mappings, regenerate both Rust oracles and run the complete validation workflow.
