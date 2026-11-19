# Compatibility and distribution matrix

| Component | Supported baseline | Evidence |
| --- | --- | --- |
| Binding | 0.2.0 (unreleased; 0.1.0 is published) | Local build and tests |
| Core | Published 0.4.0, revision 6407329777e5d3c3875e8695ebc2b683f4d4f9e1, unmodified | Hash manifest checked against the crates.io crate, independent public-Rust oracles |
| Node.js | 22 and 24 | CI matrix; local execution on 22.23.5 |
| N-API | Version 8 | Addon build configuration |
| Rust | Stable, edition 2024; dependencies locked | CI stable; local 1.97.0. The core declares 1.89; the adapter makes no lower MSRV claim |
| Linux x64, glibc | Supported CI target | Locally verified |
| Windows x64, MSVC | Supported CI target | Workflow configured; execution unverified in this checkout |
| macOS arm64 | Supported CI target | Workflow configured; execution unverified in this checkout |
| Bytecode / watchers / buffered | All enabled in production | Capability and native integration tests |
| `test_access` | Test oracles only | Production feature tree excludes it |
| ESM / CommonJS | Same named API, separate declarations | Runtime and installed consumer tests |

Other architectures, musl, other Node versions and alternative JavaScript
runtimes are unverified source-build possibilities, not supported binary targets.
No browser or asynchronous Node stream protocol is exposed. Synchronous stream
hooks cover the portable stream surface. No core functionality is intentionally
omitted; internal Rust trait objects are represented by owned descriptions.

`npm run build` creates a binary for the current platform. `npm pack` builds it
and the TypeScript outputs automatically via `prepack`. Native addons cannot
be reused across operating systems, architectures or incompatible libc variants.
`npm run test:distribution` runs the real `npm pack` command with lifecycle hooks,
installs that exact tarball in a clean consumer directory containing spaces, runs
the Node suites and actual package-name imports/requires there, and checks both
`.mts` and `.cts` consumers. Runtime tests exchange plans and compiled objects
between module formats and export/import files into previously missing directories.
Installed packages have no native download/install hook.

`node scripts/check-distribution.mjs --source` first creates and extracts a source
archive outside this checkout, runs `npm ci` and `npm pack`
there (which must build the missing outputs), and validates the resulting installed
package. The source includes Rust, TypeScript, the bundled core, lockfiles, tests,
declarations and maintenance tools.
There is no dependency on the neighboring TextForge or Python repositories.

CI runs the installed-package checks on every configured OS/Node combination;
it also rebuilds a source archive on Linux Node 24. Remote CI status is not
claimed until that workflow has actually run. Artifact upload in CI is for
inspection; no npm/crates.io publication is configured.

`vendor/CORE_REVISION` identifies the published 0.4.0 crate; source hashes pin
every bundled file to it. No binding release bundled core 0.3.x: binding 0.2.0 moves
from core 0.2.0 straight to 0.4.0.
