import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import * as api from '../index.js';
const {Pipeline, Instruction, Processor, Variable, TextForgeError, PortableBuffer, BufferOptions, FilePath, Observers, BatchPool} = api;
function directory(t: {after(fn: () => void): void}): string {
  const dir = mkdtempSync(join(tmpdir(),'textforge-node-')); t.after(() => rmSync(dir,{recursive:true,force:true})); return dir;
}
function diagnostic(e: unknown, stage: string, code?: number): boolean {
  assert.ok(e instanceof TextForgeError); assert.equal(e.stage,stage);
  if (code !== undefined) assert.equal(e.code,code);
  assert.equal(typeof e.instruction,'string'); assert.equal(typeof e.input,'string');
  return true;
}
test('ESM and CommonJS expose the same typed API', () => {
  const require = createRequire(import.meta.url);
  const cjs: typeof api = require('../../../dist/cjs/index.js');
  assert.deepEqual(Object.keys(cjs).sort(),Object.keys(api).sort());
  assert.equal(new cjs.Pipeline().addToBeginning('🍌').compile().process('é'),'🍌é');
  assert.deepEqual(api.features(),{bytecode:true,watchers:true,buffered:true});
});
test('immutable plans, reusable compilation, variables, groups and nested instructions', () => {
  const base = new Pipeline().trimBothSides(); const extended = base.addToEnd('!');
  assert.equal(base.compile().process(' é '),'é'); assert.equal(extended.compile().process(' é '),'é!');
  const source = new Pipeline().var('n',1).mutVar('n',2).repeat(new Variable('n'));
  const compiled = source.compile();
  assert.equal(compiled.process('é'),'éé'); assert.equal(compiled.process('x'),'xx');
  assert.equal(new Pipeline().iter(2,new Pipeline().addToBeginning('🍌')).compile().process('é'),'🍌🍌é');
  assert.equal(new Pipeline().blockAssoc('suffix', p => p.addToEnd('!')).callBlock('suffix').compile().process('é'),'é!');
  assert.equal(new Pipeline().ifDoContainsEach('x',p => p.removePattern('x').addToEnd('skipped')).compile().process('x'),'');
});
test('Unicode, combining marks, NUL, empty input and strict boundary conversions', () => {
  for (const input of ['', 'é🍌', 'e\u0301', 'a\0b']) assert.equal(new Pipeline().compile().process(input),input);
  for (const value of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,-1n,1n<<64n])
    assert.throws(() => new Pipeline().repeat(value),RangeError);
  for (const value of [true,null,'2',{}]) assert.throws(() => new Pipeline().repeat(value as number));
  assert.throws(() => new Pipeline().addToBeginning('\ud800'),TypeError);
  assert.throws(() => new Pipeline().compile().process('\udc00'),TypeError);
  assert.throws(() => FilePath.fromText('\ud800'),TypeError);
  assert.doesNotThrow(() => new Pipeline().repeat(0xffffffffffffffffn));
});
test('structured errors preserve stage, numeric code and context', () => {
  assert.throws(() => new Pipeline().add('missing').compile(),e => diagnostic(e,'conversion',2));
  assert.throws(() => new Pipeline().add('atb').compile(),e => diagnostic(e,'validation'));
  assert.throws(() => new Pipeline().addToBeginning(new Variable('missing')).compile().process('é'),e => diagnostic(e,'execution'));
  assert.throws(() => new Processor().getPipelineFromFile('/nonexistent.tft'),e => diagnostic(e,'persistence'));
});
test('processor lifecycle, snapshots, single and debug execution', () => {
  const processor = new Processor(); const plan = processor.createPipeline().addToBeginning('🍌');
  const id = plan.build(); const clone = processor.clonePipeline(id);
  assert.equal(processor.transformExists(id),true); assert.equal(processor.listTransforms().length,2);
  const snapshot = processor.getTransformVec(id); assert.equal(snapshot[0]?.name,'atb');
  assert.deepEqual(snapshot[0]?.arguments,['🍌']);
  const copy = processor.addTransform(snapshot);
  assert.equal(processor.runTransform(copy,'é'),'🍌é'); assert.equal(processor.processAll(clone,'x'),'🍌x');
  assert.ok(processor.getTextTransformVec(id)[0]?.includes('atb'));
  assert.equal(processor.processSingle(new Instruction('ate','!'),'é'),'é!');
  assert.equal(processor.processAllWithDebug(id,'é'),'🍌é');
  assert.equal(processor.processSingleWithDebug(new Instruction('ate','!'),'é'),'é!');
  processor.showTransforms(); processor.removeTransform(id); assert.equal(processor.transformExists(id),false);
  assert.equal(plan.compile().process('é'),'🍌é');
});
test('text and big-endian bytecode persistence, files and ordered batches', t => {
  const dir = directory(t); const processor = new Processor(); const id = processor.register(new Pipeline().addToEnd('!'));
  for (const extension of ['textforge','textforgebc']) {
    const file = join(dir,'pipeline.'+extension); writeFileSync(file,'');
    if (extension === 'textforge') processor.writePipelineToFile(id,file); else processor.writeToBytecodeFile(id,file);
    const read = extension === 'textforge' ? processor.getPipelineFromFile(file) : processor.readFromBytecodeFile(file);
    assert.equal(processor.processAll(read,'é'),'é!');
    if (extension === 'textforgebc') assert.deepEqual([...readFileSync(file).subarray(0,8)],[38,235,245,8,244,137,1,179]);
  }
  const input=join(dir,'input.txt'); writeFileSync(input,'é');
  const output=join(dir,'output.txt'); processor.processFile(id,input,output); assert.equal(readFileSync(output,'utf8'),'é!');
  const requests=[{input,pipelineId:'missing',output:join(dir,'bad.txt')},{input,pipelineId:id,output:join(dir,'good.txt')}];
  const results=processor.processBatch(requests); assert.ok(results[0] instanceof TextForgeError); assert.equal(results[1],null);
  const pool = new BatchPool(2); const pooled=processor.processBatchInPool(pool,requests); assert.ok(pooled[0] instanceof TextForgeError); assert.equal(pooled[1],null);
  pool.close(); pool.close(); assert.equal(pool.closed,true); assert.throws(() => processor.processBatchInPool(pool,requests));
});
test('lossless native paths and platform-specific representations', () => {
  if (process.platform === 'win32') {
    const wide=new Uint16Array([65,0xd800,66]); assert.deepEqual(FilePath.fromWindowsWide(wide).toWindowsWide(),wide);
    assert.throws(() => FilePath.fromNativeBytes(Buffer.from('a')),e => diagnostic(e,'conversion'));
  } else {
    const bytes=Buffer.from([97,255,98]); const file=FilePath.fromNativeBytes(bytes);
    assert.deepEqual(file.toNativeBytes(),bytes); assert.equal(file.toText(),null);
    assert.throws(() => FilePath.fromWindowsWide(new Uint16Array([65])),e => diagnostic(e,'conversion'));
  }
});
test('spooling, ranged bytes, consuming failures, cleanup and buffered batches', t => {
  const dir=directory(t); const options = new BufferOptions(1,dir);
  const input=PortableBuffer.fromText('é🍌',options); assert.equal(input.lenBytes(),6n); assert.equal(input.isEmpty(),false);
  input.spill(); assert.equal(input.isSpilled(),true); assert.deepEqual(input.readAt(0,2),Buffer.from('é'));
  assert.equal(input.readAt(0xffffffffffffffffn,10).length,0);
  const file=join(dir,'buffer.txt'); assert.equal(input.writeToFile(file),6n);
  const processor=new Processor(); const id=processor.register(new Pipeline().addToEnd('!'));
  const output=processor.processAllBuffered(id,input); assert.equal(input.closed,true); assert.throws(() => input.lenBytes());
  assert.equal(output.intoString(),'é🍌!'); assert.equal(output.closed,true); assert.throws(() => output.intoString());
  const single=processor.processSingleBuffered('ate "!";',PortableBuffer.fromText('é',options)); assert.equal(single.intoString(),'é!');
  assert.equal(processor.processFileBuffered(id,file,options).intoString(),'é🍌!');
  const batch=processor.processBatchBuffered([{pipelineId:'missing',input:file},{pipelineId:id,input:file}],options);
  assert.ok(batch[0] instanceof TextForgeError); assert.ok(batch[1] instanceof PortableBuffer); assert.equal(batch[1].intoString(),'é🍌!');
  const failure=PortableBuffer.fromText('é',options); assert.throws(() => processor.processAllBuffered('missing',failure)); assert.equal(failure.closed,true);
  const explicit=PortableBuffer.fromFile(file,options); explicit.spill(); explicit.close(); explicit.close(); assert.equal(explicit.closed,true);
  assert.deepEqual(readdirSync(dir),['buffer.txt']);
});
test('synchronous stream callbacks, UTF-8 chunks, short writes and exceptions', () => {
  const chunks=[Buffer.from([0xc3]),Buffer.from([0xa9]),Buffer.alloc(0)];
  const buffer=PortableBuffer.fromReader(max => { assert.ok(max>0n); return chunks.shift()!; });
  const writes: Buffer[]=[];
  assert.equal(buffer.copyTo(bytes => { writes.push(bytes.subarray(0,1)); return 1; }),2n);
  assert.equal(Buffer.concat(writes).toString(),'é');
  assert.throws(() => buffer.copyTo(bytes => bytes.length+1),e => diagnostic(e,'execution'));
  assert.throws(() => PortableBuffer.fromReader(() => {throw new Error('reader failed');}),e => diagnostic(e,'execution'));
  assert.throws(() => PortableBuffer.fromReader(() => Buffer.from([255])),e => diagnostic(e,'execution'));
  assert.throws(() => PortableBuffer.fromReader(max => Buffer.alloc(Number(max)+1)),e => diagnostic(e,'execution'));
  buffer.close();
});
test('watchers, custom callback errors, report preservation and reentrancy guards', t => {
  const dir=directory(t); const report=join(dir,'report.json'); const processor=new Processor();
  const id=processor.register(new Pipeline().addToEnd('!')); const observers=new Observers();
  assert.ok(Observers.builtinNames().includes('current_len_chars'));
  observers.setBuiltin('size','current_len_chars'); observers.scheduleAll('size');
  observers.set('custom',o => { assert.equal(typeof o.current,'string'); return 'é'; }); observers.scheduleAll('custom');
  assert.equal(processor.processAllWithWatchers(id,'é',observers,report),'é!');
  assert.ok(readFileSync(report,'utf8').includes('custom'));
  observers.run({current:'é',before:'',instruction:'atb'}); observers.writeReport(report); observers.reset();
  const previous=readFileSync(report,'utf8');
  observers.set('custom',() => { throw new Error('callback failed'); });
  assert.throws(() => processor.processAllWithWatchers(id,'é',observers,report),e => diagnostic(e,'callback',27));
  assert.equal(readFileSync(report,'utf8'),previous); observers.reset();
  observers.set('custom',() => { assert.throws(() => processor.removeTransform(id)); assert.throws(() => observers.reset()); return 'safe'; });
  assert.equal(processor.processAllWithWatchers(id,'é',observers,report),'é!');
  observers.close(); observers.close(); assert.equal(observers.closed,true); assert.throws(() => observers.reset());
});
test('independent Node workers load and execute the addon concurrently', async () => {
  const moduleUrl=new URL('../index.js',import.meta.url).href;
  const code=`const {parentPort}=require('node:worker_threads'); import(${JSON.stringify(moduleUrl)}).then(({Pipeline})=>parentPort.postMessage(new Pipeline().addToEnd('!').compile().process('é')))`;
  const values=await Promise.all([1,2].map(() => new Promise((resolve,reject) => {
    const worker=new Worker(code,{eval:true}); worker.once('message',resolve); worker.once('error',reject);
  })));
  assert.deepEqual(values,['é!','é!']);
});
