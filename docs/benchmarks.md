# Benchmarks

`npm run benchmark` measures what the binding costs on top of the engine. It
runs the same scenarios twice: through the public Rust API of the bundled core
(`examples/benchmark_native.rs`, release build) and through the Node.js package
(`dist/` and `native.node`; run `npm run build` first).

```sh
npm run build
npm run benchmark                         # table on stdout
npm run benchmark -- --quick              # smaller, for a smoke run
npm run benchmark -- --markdown --json docs/benchmarks/<version>-<platform>.json
```

Each scenario is warmed up once and reports the median of 7 repetitions (3 with
`--quick`). Times are per operation; throughput counts input bytes. Absolute
numbers depend on the machine; compare the **Node / native** ratio, and rerun
before drawing conclusions: on a shared virtual machine individual rows move by
up to ±30% between runs.

## Scenarios

| Scenario | What runs |
| --- | --- |
| `call_small` | `processAll` of a 5-instruction cleanup pipeline (`tbs`, `tla`, `raw`, `dle`, `ate`) on a 22-byte string. |
| `build_plan` | Building and registering that pipeline, then removing it. |
| `throughput_1mib`, `throughput_16mib` | The cleanup pipeline on 1 MiB and 16 MiB of multi-line text with accents and emoji. |
| `sections_4mib` | `onLine` on the middle line and `deleteLine('[[__LINES__ - 1]]')` on 4 MiB. |
| `plain_instruction`, `try_ignore_ok`, `try_ignore_fail` | `dls 0` alone, inside `tryIgnore`, and a failing `dls 999` inside `tryIgnore`. |
| `error_details` | A failing run whose error is read (`kind`, `parameters`, `report`). |
| `buffered_16mib` | The cleanup pipeline on a spilled 16 MiB `PortableBuffer`. |
| `batch_files` | `processBatch` over 64 files of 256 KiB. |
| `compile_standalone` | `Pipeline.compile()` without a processor (Node only). |
| `watchers_builtin`, `watchers_callback` | A watched run on 64 KiB with a built-in metric or a JavaScript callback (Node only). |
| `profile_unlimited_1mib` | The cleanup pipeline with `ExecutionProfile.unlimited()` (Node only). |

## Results for 0.2.0

Binding 0.2.0, core 0.4.0, Node.js 22.23.5, rustc 1.97.0, Linux x64 on a
2-core Intel Xeon at 2.10 GHz (virtual machine). Raw data:
[0.2.0-linux-x64.json](benchmarks/0.2.0-linux-x64.json).

| Scenario | Native Rust | Node binding | Node / native |
| --- | --- | --- | --- |
| `call_small` | 0.82 µs | 1.25 µs | 1.52× |
| `build_plan` | 25.96 µs | 48.92 µs | 1.88× |
| `throughput_1mib` | 79.8 MiB/s | 57.4 MiB/s | 1.39× |
| `throughput_16mib` | 89.1 MiB/s | 55.6 MiB/s | 1.60× |
| `sections_4mib` | 258.2 MiB/s | 127.2 MiB/s | 2.03× |
| `plain_instruction` | 0.36 µs | 0.92 µs | 2.55× |
| `try_ignore_ok` | 0.36 µs | 0.95 µs | 2.65× |
| `try_ignore_fail` | 0.97 µs | 2.26 µs | 2.33× |
| `error_details` | 2.27 µs | 13.08 µs | 5.76× |
| `buffered_16mib` | 62.0 MiB/s | 49.4 MiB/s | 1.26× |
| `batch_files` | 128.7 MiB/s | 135.4 MiB/s | 0.95× |
| `compile_standalone` | — | 59.31 µs | — |
| `watchers_builtin` | — | 1,602.29 µs | — |
| `watchers_callback` | — | 2,861.54 µs | — |
| `profile_unlimited_1mib` | — | 73.4 MiB/s | — |

## What the numbers say

- **Every call pays a fixed boundary cost of about 0.5 µs** (`call_small`,
  `plain_instruction`): argument checks in TypeScript, the N-API call and the
  string conversions. It matters only for many calls on tiny inputs; batch
  small inputs into one text when you can.
- **Large texts are converted twice.** JavaScript strings are UTF-16; the engine
  works on UTF-8. Each call converts the input and the result, which costs
  roughly 30–40 ms per 16 MiB direction on this machine and explains most of
  the 1.4–2× gap in the throughput rows. The work inside the engine is the same
  as in Rust. When the gap matters, prefer `processFile`, `processBatch` or
  `processFileBuffered` with `PortableBuffer.writeToFile`: those read and write
  files natively.
- **File batches run at native speed** (`batch_files`): the text never crosses
  into JavaScript.
- **`tryIgnore` adds almost nothing when the instruction succeeds**
  (`try_ignore_ok` against `plain_instruction`). An ignored failure costs about
  one extra microsecond, natively too: the engine builds the error before
  discarding it.
- **Errors are the most expensive crossing** (`error_details`, about 11 µs
  over native): each thrown `TextForgeError` is a new JavaScript object with
  its trace and parameter arrays. That is fine for errors; do not use
  exceptions as a normal control path in a tight loop (`tryIgnore` stays in
  the engine and is about five times cheaper).
- **JavaScript watcher callbacks cost about 80% more** than built-in metrics
  for the same report: every observation crosses into JavaScript. Watchers are
  a diagnostic tool, as in the core; do not leave them on in production runs.
- **Profiles do not slow processing down**: `profile_unlimited_1mib` is not
  slower than `throughput_1mib`; the difference between the two rows is noise.

## Optimization made with these numbers

The first run showed the check for unpaired UTF-16 surrogates at the
TypeScript boundary (a regular expression over the whole string) costing more
than the native call itself: about 108 ms per 16 MiB string. It now uses
`String.prototype.isWellFormed()`, which tests exactly the same property in
about 8 ms. Before → after on the same machine:

| Scenario | Before | After |
| --- | --- | --- |
| `throughput_16mib` | 35.1 MiB/s | 55.6 MiB/s |
| `sections_4mib` | 61.5 MiB/s | 127.2 MiB/s |
| `buffered_16mib` | 36.1 MiB/s | 49.4 MiB/s |

Behavior did not change: `ts/tests/api.test.ts` checks lone high and low
surrogates at the start, middle and end of a string.
