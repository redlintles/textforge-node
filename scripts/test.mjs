// Native Rust stdout bypasses Node's test subprocess event framing. Run each
// node:test suite directly, preserving its exit code and ordinary text reporter.
import {readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const file of readdirSync('dist/esm/tests').filter(p=>p.endsWith('.test.js')))
  execFileSync(process.execPath,[`dist/esm/tests/${file}`],{stdio:'inherit'});
