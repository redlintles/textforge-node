/**
 * Benchmark the Node.js binding against the native Rust core.
 *
 *   npm run benchmark                 # build, run both sides, print a table
 *   npm run benchmark -- --quick      # fewer operations, for a smoke run
 *   npm run benchmark -- --json f.json --markdown
 *
 * The native side is examples/benchmark_native.rs, built in release mode; it
 * runs the same scenarios through the public Rust API. The Node side uses the
 * built package in dist/ and native.node (run `npm run build` first). Every
 * scenario is warmed up once and reports the median of several repetitions.
 * Numbers depend on the machine: compare ratios, not absolute values.
 */
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {cpus,platform,arch,release,tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {
  BufferOptions,ExecutionProfile,Observers,Pipeline,PortableBuffer,Processor,coreVersion,version,
} from '../dist/esm/index.js';

const argv = process.argv.slice(2);
const quick = argv.includes('--quick');
const jsonPath = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : undefined;
const scale = quick ? 1 : 4, repeats = quick ? 3 : 7;
const sink = [];

/** Median of `repeats` timings of `run`, in nanoseconds, after one warm-up. */
function measure(run) {
  run();
  const timings = [];
  for (let index = 0; index < repeats; index++) {
    const start = performance.now(); run(); timings.push((performance.now() - start) * 1e6);
  }
  timings.sort((a, b) => a - b);
  if (sink.length > 1000) sink.length = 0;
  return timings[Math.floor(timings.length / 2)];
}
/** Same generator as examples/benchmark_native.rs (byte lengths match). */
function text(bytes) {
  const parts = []; let length = 0, line = 0;
  while (length < bytes) {
    const value = `  Line ${line}: The Quick Brown Fox é🍌  \n` + (line % 10 === 9 ? '\n' : '');
    parts.push(value); length += Buffer.byteLength(value); line++;
  }
  return parts.join('');
}
const cleanup = () => new Pipeline().trimBothSides().toLowercaseAll().replaceAllWith('[aeiou]','*').deleteEmptyLines().addToEnd('!');

const directory = mkdtempSync(join(tmpdir(),'textforge-benchmark-'));
const results = {};
const record = (name, operations, nanoseconds, kind) => { results[name] = {...results[name], node: nanoseconds, operations, kind}; };
try {
  console.error('Running the native Rust baseline (cargo, release)…');
  mkdirSync(join(directory,'native'));
  const native = execFileSync('cargo',['run','--quiet','--release','--locked','--example','benchmark_native','--',join(directory,'native'),...(quick ? ['--quick'] : [])],
    {encoding:'utf8',stdio:['ignore','pipe','inherit']});
  for (const line of native.split('\n')) {
    const [tag, name, operations, nanoseconds] = line.split('\t');
    if (tag === 'BENCH') results[name] = {native: Number(nanoseconds), operations: Number(operations)};
  }

  console.error('Running the Node.js binding…');
  const small = '  Hello World é🍌  ';
  const processor = new Processor();
  const id = processor.register(cleanup());
  const calls = 5_000 * scale;
  record('call_small', calls, measure(() => { for (let i = 0; i < calls; i++) sink.push(processor.processAll(id,small)); }), 'op');
  const builds = 1_000 * scale;
  record('build_plan', builds, measure(() => { for (let i = 0; i < builds; i++) processor.removeTransform(processor.register(cleanup())); }), 'op');
  for (const [name, bytes] of [['throughput_1mib', 1 << 20], ['throughput_16mib', 16 << 20]]) {
    const input = text(bytes);
    record(name, Buffer.byteLength(input), measure(() => sink.push(processor.processAll(id,input))), 'byte');
  }
  const lines = text(4 << 20);
  const middle = Math.floor(lines.split('\n').length / 2);
  const sections = processor.register(new Pipeline().onLine(middle,new Pipeline().toUppercaseAll()).deleteLine('[[__LINES__ - 1]]'));
  record('sections_4mib', Buffer.byteLength(lines), measure(() => sink.push(processor.processAll(sections,lines))), 'byte');
  const short = calls;
  for (const [name, plan] of [
    ['plain_instruction', new Pipeline().deleteSingle(0)],
    ['try_ignore_ok', new Pipeline().tryIgnore(new Pipeline().deleteSingle(0))],
    ['try_ignore_fail', new Pipeline().tryIgnore(new Pipeline().deleteSingle(999))],
  ]) {
    const pipeline = processor.register(plan);
    record(name, short, measure(() => { for (let i = 0; i < short; i++) sink.push(processor.processAll(pipeline,small)); }), 'op');
  }
  const failing = processor.register(new Pipeline().deleteSingle(999)), errors = 2_000 * scale;
  record('error_details', errors, measure(() => {
    for (let i = 0; i < errors; i++) {
      try { processor.processAll(failing,small); } catch (error) { sink.push(error.kind, error.parameters.length, error.report); }
    }
  }), 'op');
  const large = text(16 << 20), spill = join(directory,'spill'); mkdirSync(spill);
  record('buffered_16mib', Buffer.byteLength(large), measure(() => {
    sink.push(processor.processAllBuffered(id,PortableBuffer.fromText(large,new BufferOptions(1,spill))).intoString());
  }), 'byte');
  const files = 16 * scale, chunk = text(256 << 10);
  const tasks = Array.from({length:files},(_, index) => {
    const input = join(directory,`in-${index}.txt`); writeFileSync(input,chunk);
    return {input, pipelineId:id, output:join(directory,`out-${index}.txt`)};
  });
  record('batch_files', files * Buffer.byteLength(chunk), measure(() => {
    for (const error of processor.processBatch(tasks)) if (error) throw error;
  }), 'byte');

  // Node-only scenarios: costs that exist only on the JavaScript side.
  const plans = 1_000 * scale;
  record('compile_standalone', plans, measure(() => { for (let i = 0; i < plans; i++) sink.push(cleanup().compile()); }), 'op');
  const watched = processor.register(cleanup()), watchInput = text(64 << 10), runs = 50 * scale;
  for (const [name, configure] of [
    ['watchers_builtin', observers => observers.setBuiltin('size','current_len_chars')],
    ['watchers_callback', observers => observers.set('size',o => String(o.current.length))],
  ]) {
    const observers = new Observers();
    try {
      configure(observers); observers.scheduleAll('size');
      const report = join(directory,`${name}.json`);
      record(name, runs, measure(() => { for (let i = 0; i < runs; i++) sink.push(processor.processAllWithWatchers(watched,watchInput,observers,report)); }), 'op');
    } finally { observers.close(); }
  }
  const limited = new Processor().withProfile(ExecutionProfile.balanced().unlimited());
  const unlimited = limited.register(cleanup());
  const megabyte = text(1 << 20);
  record('profile_unlimited_1mib', Buffer.byteLength(megabyte), measure(() => sink.push(limited.processAll(unlimited,megabyte))), 'byte');
} finally {
  rmSync(directory,{recursive:true,force:true});
}

const format = (value, digits = 1) => value.toLocaleString('en-US',{maximumFractionDigits:digits,minimumFractionDigits:digits});
function cell(nanoseconds, {operations, kind}) {
  if (nanoseconds === undefined) return '—';
  return kind === 'byte' ? `${format(operations / 1048576 / (nanoseconds / 1e9))} MiB/s` : `${format(nanoseconds / operations / 1000,2)} µs`;
}
const rows = Object.entries(results).map(([name, value]) => [
  name, cell(value.native,value), cell(value.node,value),
  value.native === undefined ? '—' : `${format(value.node / value.native,2)}×`,
]);
const header = ['Scenario','Native Rust','Node binding','Node / native'];
if (argv.includes('--markdown')) {
  console.log(`| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |`);
  for (const row of rows) console.log(`| \`${row[0]}\` | ${row.slice(1).join(' | ')} |`);
} else {
  const widths = header.map((title, index) => Math.max(title.length, ...rows.map(row => row[index].length)));
  for (const row of [header, ...rows]) console.log(row.map((value, index) => value.padEnd(widths[index])).join('  '));
}
const environment = {
  binding: version, core: coreVersion, node: process.version, platform: `${platform()} ${release()} ${arch()}`,
  cpu: cpus()[0]?.model ?? 'unknown', cores: cpus().length, quick,
  rustc: execFileSync('rustc',['--version'],{encoding:'utf8'}).trim(),
};
console.error(`\n${environment.cpu}, ${environment.cores} cores · ${environment.platform} · Node ${environment.node} · ${environment.rustc}`);
if (jsonPath) writeFileSync(jsonPath, JSON.stringify({environment, results}, null, 2) + '\n');
