# Development

How the repository is organized, how to check a change and how to prepare a
release. The binding is an adapter: engine behavior belongs to the core
(`vendor/textforge`, see [core provenance](core.md)), never to this repository.

## Layout

| Path | Contents |
| --- | --- |
| `src/` | Rust N-API adapter over `textforge::api::portable` (`lib.rs`: instructions, plans and errors; `processor.rs`: processor, batches and profiles; `paths.rs`, `buffers.rs`, `watchers.rs`). |
| `ts/` | Public TypeScript API (`index.ts`), the ESM facade (`entry.ts`), generated option types (`options.ts`) and the generated native declarations (`native-types.d.ts`). |
| `ts/tests/` | Node test suites, built into `dist/esm/tests` and shipped with the package. |
| `ts/type-tests/` | Compile-only checks of the public types. |
| `tests/` | Rust tests of the portable contracts the adapter relies on; `tests/fixtures` holds the Rust oracle outputs. |
| `examples/` | Rust oracles (`builder_reference.rs`, `processor_reference.rs`) and the native benchmark baseline (`benchmark_native.rs`). |
| `scripts/` | Generators, checks, the distribution test and the benchmark. |
| `vendor/` | The published core, unmodified, and `CORE_REVISION`. |
| `docs/` | This documentation, the parity mappings and the benchmark data. |

## Everyday commands

```sh
npm ci                     # dependencies (no install scripts run)
npm run build              # native addon (release) + TypeScript
npm test                   # every Node suite in dist/esm/tests
npm run typecheck
python3 scripts/check.py   # the full pre-commit matrix (below)
npm run test:distribution  # pack, install in a clean project, test it there
npm run benchmark          # binding against native Rust (docs/benchmarks.md)
```

`python3 scripts/check.py` runs, in order: `cargo fmt --check`, `cargo clippy`
with and without `test_access`, `cargo test` with the default, `bytecode`,
`watchers` and `test_access` features, the core check, the three generator
checks, the parity check, the type check and the Node suites. Run it before
every commit. It needs `cargo fetch --manifest-path scripts/upstream/Cargo.toml`
once, for the core check.

## Test suites

| Suite | What it covers |
| --- | --- |
| `ts/tests/api.test.ts` | Plans, compilation, variables, groups, boundary conversions, processor lifecycle, persistence, debug, batches, watchers, buffers, worker threads. |
| `ts/tests/parity.test.ts` | Every Rust builder oracle case, the processor oracle with every error field, and a text/bytecode round trip of every builder case. |
| `ts/tests/robustness.test.ts` | Registration shapes, ESM/CommonJS identity, persistence rules of core 0.4.0, invalid arguments, non-UTF-8 paths, buffers, replacement maps. |
| `ts/tests/errors.test.ts` | Error details: kind, trace, parameters, hint, report, limits, batch errors. |
| `ts/tests/profiles.test.ts` | Execution profiles, limits and pipeline names. |
| `ts/tests/instructions.test.ts` | `tryIgnore`, sections, expressions in numeric parameters, 0-based lines, file instructions and `pipelineJoin`. |
| `ts/tests/behavior.test.ts` | The new instructions together with Unicode, the nesting rule, watchers, buffers, batches, persistence and workers. |
| `tests/*.rs` | Portable contracts: decimal-text assignments, persistence, replacement maps. |
| `scripts/check-distribution.mjs` | The packed tarball installed in a clean project: all suites, an ESM/CommonJS smoke test and `.mts`/`.cts` type checks. `--source` rebuilds from a source archive first. |

## Generated sources

Never edit these by hand; regenerate them and review the diff.

| Output | Command | Source |
| --- | --- | --- |
| Builder methods in `ts/index.ts`, `ts/options.ts`, `docs/builder-parity.json` | `python3 scripts/generate-builder.py` | Core builder trait, registry, normalization modes, watcher metrics, profile presets |
| `examples/builder_reference.rs`, `tests/fixtures/builder_reference.json` | `python3 scripts/generate-reference.py` | Core doctests plus the explicit cases in the script |
| `tests/fixtures/processor_reference.json` | `python3 scripts/generate-processor-reference.py` | `examples/processor_reference.rs` (hand-written) |
| `docs/processor-parity.json` | `python3 scripts/check-parity.py --write` | Core processor and portable methods |
| `ts/native-types.d.ts` | `npm run build` | `#[napi]` items in `src/` |

Each command takes `--check` (the parity check runs without `--write`) to fail
on stale output; CI uses them.

## Updating the core

Follow [core provenance](core.md#updating-the-core). The core repository's
own `AGENTS.md` requires maintainer approval for binding updates.

## Preparing a release

1. Set the version in `package.json`, `package-lock.json`, `Cargo.toml`
   (then `cargo update -p textforge-node --offline`) and `version` in
   `ts/index.ts`; `coreVersion` follows the bundled core.
2. Make sure the `Unreleased` entry of [the changelog](../Changelog.md) lists
   every change, behavior changes first, and update the
   [compatibility matrix](compatibility.md).
3. Run `npm run build`, `python3 scripts/check.py`, `npm run test:distribution`
   and `node scripts/check-distribution.mjs --source`.
4. Optionally refresh the [benchmarks](benchmarks.md) and commit the JSON.
5. Push and wait for CI on Linux, Windows and macOS with Node.js 22 and 24.
6. Replace `Unreleased` with the version and date, then publish from a clean
   checkout (`npm publish`; `prepack` builds the addon for the current
   platform) and tag it (`git tag v<version>`). Publishing and pushing are
   maintainer actions.

The package contains one native addon, built on the machine that runs
`npm publish`; it works only on that OS, architecture and libc
([compatibility](compatibility.md)).
