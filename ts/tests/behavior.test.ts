// How the 0.4.0 surface behaves together with the rest of the binding: Unicode,
// nesting limits, watchers, buffers, batches, persistence and worker threads.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {
  BufferOptions,ExecutionProfile,Instruction,Observers,Pipeline,PortableBuffer,Processor,TextForgeError,Variable,
} from '../index.js';

function directory(t: {after(fn: () => void): void}): string {
  const dir = mkdtempSync(join(tmpdir(),'textforge-node-behavior-')); t.after(() => rmSync(dir,{recursive:true,force:true})); return dir;
}
const run = (plan: Pipeline, input: string) => plan.compile().process(input);

test('sections count Unicode scalar values and keep line terminators', () => {
  assert.equal(run(new Pipeline().onChunk(1,2,new Pipeline().toUppercaseAll()),'é🍌ab'),'é🍌Ab');
  assert.equal(run(new Pipeline().onChunk(0,1,new Pipeline().toReverse()),'éx'),'́ex');
  assert.equal(run(new Pipeline().onLine(1,new Pipeline().toReverse()),'a\r\nb🍌é\r\nc'),'a\r\né🍌b\r\nc');
  // Empty text has no line 0 and no character 0; under tryIgnore the failure is a no-op.
  assert.throws(() => run(new Pipeline().onLine(0,new Pipeline().addToEnd('!')),''),e => e instanceof TextForgeError && e.kind === 'IndexOutOfRange');
  assert.equal(run(new Pipeline().tryIgnore(new Pipeline().deleteSingle(0)),''),'');
});

test('nested instructions allow one level, as the core rules say', () => {
  const tooDeep = [
    () => new Pipeline().tryIgnore(new Instruction('iter',3,new Instruction('dls',0))),
    () => new Pipeline().iter(2,new Pipeline().tryIgnore(new Pipeline().deleteSingle(1))),
    () => new Pipeline().onLine(0,new Pipeline().tryIgnore(new Pipeline().deleteSingle(1))),
  ];
  for (const plan of tooDeep) assert.throws(() => plan().compile(),e => e instanceof TextForgeError && e.stage === 'validation' && e.code === 20);
  // Blocks are not nested instructions: tryIgnore runs again on every call.
  assert.equal(run(new Pipeline().blockAssoc('b',p => p.tryIgnore(new Pipeline().deleteSingle(5)).addToEnd('!')).callBlock('b').callBlock('b'),'x'),'x!!');
});

test('tryIgnore keeps the state from before the failed instruction', () => {
  const plan = new Pipeline().var('n',2).tryIgnore(new Pipeline().mutVar(new Variable('missing'),3)).repeat(new Variable('n'));
  assert.equal(run(plan,'ab'),'abab');
  const processor = new Processor();
  assert.equal(processor.processSingle(new Pipeline().tryIgnore(new Pipeline().deleteSingle(9)),'abc'),'abc');
  assert.equal(processor.processSingleWithDebug(new Pipeline().tryIgnore(new Pipeline().deleteSingle(1)),'abc'),'ac');
  const id = processor.register(new Pipeline().tryIgnore(new Pipeline().deleteSingle(9)).addToEnd('!'));
  assert.equal(processor.processAllWithDebug(id,'abc'),processor.processAll(id,'abc'));
});

test('watchers observe a run that ignores an error', t => {
  const dir = directory(t), processor = new Processor(), observers = new Observers(); t.after(() => observers.close());
  const seen: string[] = [];
  observers.set('instructions',o => { seen.push(o.instruction); return o.current; }); observers.scheduleAll('instructions');
  const id = processor.register(new Pipeline().tryIgnore(new Pipeline().deleteSingle(9)).onLine(0,new Pipeline().addToEnd('!')));
  const report = join(dir,'report.json');
  assert.equal(processor.processAllWithWatchers(id,'abc',observers,report),'abc!');
  assert.equal(seen.length,2);
  assert.ok(JSON.parse(readFileSync(report,'utf8')));
});

test('callback failures report their stage and kind', t => {
  const dir = directory(t), processor = new Processor(), observers = new Observers(); t.after(() => observers.close());
  observers.set('bad',() => { throw new Error('boom'); }); observers.scheduleAll('bad');
  assert.throws(() => processor.processAllWithWatchers(processor.register(new Pipeline().addToEnd('!')),'a',observers,join(dir,'r.json')),
    e => e instanceof TextForgeError && e.stage === 'callback' && e.code === 27 && typeof e.kind === 'string' && /boom/.test(e.message));
});

test('spilled buffers give the same results as memory for the new instructions', t => {
  const dir = directory(t), processor = new Processor();
  const id = processor.register(new Pipeline().tryIgnore(new Pipeline().deleteSingle(1_000_000)).onLine(1,new Pipeline().toUppercaseAll())
    .onChunk(0,2,new Pipeline().toReverse()).deleteLine('[[__LINES__ - 1]]'));
  const input = 'é🍌a\nline two\n' + 'x'.repeat(10_000) + '\nlast';
  const buffer = PortableBuffer.fromText(input,new BufferOptions(1,dir));
  assert.equal(buffer.isSpilled(),true);
  assert.equal(processor.processAllBuffered(id,buffer).intoString(),processor.processAll(id,input));
});

test('batches report a profile limit per task without stopping the others', t => {
  const dir = directory(t);
  const processor = new Processor().withProfile(ExecutionProfile.balanced().withLimits({maxGeneratedBytes:16,maxIterations:null}));
  const id = processor.register(new Pipeline().repeat(4));
  const small = join(dir,'small.txt'), large = join(dir,'large.txt'); writeFileSync(small,'ab'); writeFileSync(large,'abcdefgh');
  const [ok, limited] = processor.processBatch([
    {pipelineId:id,input:small,output:join(dir,'small.out')},
    {pipelineId:id,input:large,output:join(dir,'large.out')},
  ]);
  assert.equal(ok,null); assert.equal(readFileSync(join(dir,'small.out'),'utf8'),'abababab');
  assert.ok(limited instanceof TextForgeError); assert.equal(limited.code,31); assert.equal(limited.ignorable,false);
});

test('the full unsigned 64-bit range is accepted for limits', () => {
  const max = (1n << 64n) - 1n;
  const profile = new ExecutionProfile({spoolThreshold:4096,maxGeneratedBytes:max,maxIterations:max});
  const processor = new Processor().withProfile(profile);
  assert.ok(processor.profile().equals(profile));
  assert.equal(processor.processAll(processor.register(new Pipeline().repeat(2)),'é'),'éé');
});

test('snapshots and both file formats keep nested and expression arguments', t => {
  const dir = directory(t), processor = new Processor();
  const id = processor.register(new Pipeline().tryIgnore(new Pipeline().deleteSingle(9)).deleteLine('[[__LINES__ - 1]]')
    .onChunk('{{start}}',1,new Pipeline().toUppercaseAll()).val('start',0));
  const snapshot = processor.getTransformVec(id);
  assert.equal(snapshot[0]!.name,'tryi'); assert.ok(snapshot[0]!.arguments[0] instanceof Instruction);
  assert.equal(snapshot[1]!.arguments[0],'[[__LINES__ - 1]]');
  const copy = processor.addTransform(snapshot);
  const input = 'abc\nlast';
  // `start` is defined after onChunk, so the copy fails exactly like the original.
  assert.throws(() => processor.processAll(id,input),TextForgeError);
  assert.throws(() => processor.processAll(copy,input),TextForgeError);
  const valid = processor.register(new Pipeline().val('start',0).tryIgnore(new Pipeline().deleteSingle(9))
    .deleteLine('[[__LINES__ - 1]]').onChunk('{{start}}',1,new Pipeline().toUppercaseAll()));
  for (const [file, read, write] of [[join(dir,'p.tft'),'getPipelineFromFile','writePipelineToFile'],[join(dir,'p.tfb'),'readFromBytecodeFile','writeToBytecodeFile']] as const) {
    processor[write](valid,file);
    assert.equal(processor.processAll(processor[read](file),input),'ABc\n');
  }
});

test('workers use independent processors and profiles', async () => {
  const module = new URL('../index.js',import.meta.url).href;
  const source = `
    const {parentPort} = require('node:worker_threads');
    import(${JSON.stringify(module)}).then(t => {
      const p = new t.Processor().withProfile(t.ExecutionProfile.lowMemory().unlimited());
      const id = p.register(new t.Pipeline().tryIgnore(new t.Pipeline().deleteSingle(9)).onLine(0,new t.Pipeline().addToEnd('!')));
      let kind = '';
      try { new t.Pipeline().deleteSingle(9).compile().process('a'); } catch (e) { kind = e.kind; }
      parentPort.postMessage([p.processAll(id,'w'), String(p.profile().maxIterations), kind]);
    });`;
  const results = await Promise.all([0,1].map(() => new Promise<unknown>((resolve,reject) => {
    const worker = new Worker(source,{eval:true});
    worker.once('message',resolve); worker.once('error',reject);
  })));
  for (const result of results) assert.deepEqual(result,['w!','null','IndexOutOfRange']);
  assert.ok(new Processor().profile().equals(ExecutionProfile.balanced()),'workers do not change this thread');
});
