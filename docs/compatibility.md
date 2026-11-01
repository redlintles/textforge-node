# Compatibility and distribution matrix

| Component | Supported baseline | Evidence |
| --- | --- | --- |
| Binding | 0.1.0 | Local build and tests |
| Core | Published 0.2.0, revision c2ed4b8f4c96c9e3ddc53576a3cdbf6ccd38bc9e, approved portable numeric-assignment patch | Hash manifest, patch and independent public-Rust oracles |
| Node.js | 22 and 24 | CI matrix; local execution on 24.14.1 |
| N-API | Version 8 | Addon build configuration |
| Rust | Stable, edition 2024; dependencies locked | CI stable; local 1.99.1; no lower MSRV claim |
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

`npm run build` creates a binary for the current platform. Native addons cannot
be reused across operating systems, architectures or incompatible libc variants.
`npm run test:distribution` creates a platform-restricted tarball in a temporary
staging directory, installs it in a clean consumer, runs the Node suites there,
and checks both `.mts` and `.cts` consumers. Tarball platform metadata includes
OS/CPU and Linux glibc. Installed packages have no native download/install hook.

`node scripts/check-distribution.mjs --source` first creates and extracts a source
archive outside this checkout, runs `npm ci` and a full native/TypeScript build
there, and validates the resulting installed package. The source includes Rust,
TypeScript, the bundled core, lockfiles, tests, declarations and maintenance tools.
There is no dependency on the neighboring TextForge or Python repositories.

CI runs the installed-package checks on every configured OS/Node combination;
it also rebuilds a source archive on Linux Node 24. Remote CI status is not
claimed until that workflow has actually run. Artifact upload in CI is for
inspection; no npm/crates.io publication is configured.
