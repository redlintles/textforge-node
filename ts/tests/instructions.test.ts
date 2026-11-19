// Builder methods added by TextForge 0.3.0 and 0.4.0, through the generated fluent API.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Instruction,Pipeline,Processor,TextForgeError,Variable} from '../index.js';

function directory(t: {after(fn: () => void): void}): string {
  const dir = mkdtempSync(join(tmpdir(),'textforge-node-instructions-')); t.after(() => rmSync(dir,{recursive:true,force:true})); return dir;
}
const run = (plan: Pipeline, input: string) => plan.compile().process(input);

test('tryIgnore skips a failing instruction but never a safety limit', () => {
  assert.equal(run(new Pipeline().tryIgnore(new Pipeline().deleteSingle(9)).addToEnd('!'),'abc'),'abc!');
  assert.equal(run(new Pipeline().tryIgnore(new Instruction('dls',1)),'abc'),'ac');
  assert.throws(() => run(new Pipeline().tryIgnore(new Pipeline().repeat(3_000_000_000)),'x'),
    e => e instanceof TextForgeError && e.code === 31);
  assert.throws(() => new Pipeline().tryIgnore(new Variable('x') as unknown as Instruction),TypeError);
  assert.throws(() => new Pipeline().tryIgnore(new Pipeline().deleteFirst().deleteLast()),TypeError);
});

test('section instructions apply one instruction to a line, a chunk or a line interval', () => {
  assert.equal(run(new Pipeline().onLine(1,new Pipeline().toUppercaseAll()),'a\nb\nc'),'a\nB\nc');
  // The interval is one section: the instruction sees "a\nb" once.
  assert.equal(run(new Pipeline().onLineInterval(0,1,new Pipeline().addToEnd('!')),'a\nb\nc'),'a\nb!\nc');
  assert.equal(run(new Pipeline().onChunk(1,3,new Pipeline().toUppercaseAll()),'abcdef'),'aBCDef');
  assert.equal(run(new Pipeline().var('n',2).onLine(new Variable('n'),new Pipeline().addToEnd('?')),'a\nb\nc'),'a\nb\nc?');
});

test('numeric parameters accept expressions and templates resolved by the engine', () => {
  assert.equal(run(new Pipeline().deleteLine('[[__LINES__ - 1]]'),'a\nb\nc'),'a\nb\n');
  assert.equal(run(new Pipeline().val('n',1).deleteSingle('{{n}}'),'abc'),'ac');
  // Plain digits are not an expression: the engine rejects them, as in Rust.
  assert.throws(() => run(new Pipeline().repeat('2'),'x'),e => e instanceof TextForgeError && e.code === 23);
});

test('line numbers count from 0 (TextForge 0.3.2)', () => {
  assert.equal(run(new Pipeline().deleteLine(0),'a\nb'),'b');
  assert.equal(run(new Pipeline().replaceLine(1,'B'),'a\nb'),'a\nB');
  assert.equal(run(new Pipeline().insertLine(0,'first'),'a\nb'),'first\na\nb');
  assert.equal(run(new Pipeline().selectLines(1,2),'a\nb\nc'),'b\nc');
});

test('file instructions read, write and insert files during a run', t => {
  const dir = directory(t), head = join(dir,'head.txt'), tail = join(dir,'tail.txt'), out = join(dir,'out.txt');
  writeFileSync(head,'HEAD '); writeFileSync(tail,' TAIL');
  const plan = new Pipeline().prependFile(head).appendFile(tail).insertFile(0,head).writeToFile(out).addToEnd('#');
  assert.equal(run(plan,'mid'),'HEAD HEAD mid TAIL#');
  assert.equal(readFileSync(out,'utf8'),'HEAD HEAD mid TAIL');
  assert.throws(() => run(new Pipeline().appendFile(join(dir,'missing.txt')),'x'),e => e instanceof TextForgeError && e.kind === 'FileOpeningError' && e.cause !== null);
});

test('pipelineJoin runs a pipeline file and survives both persistence formats', t => {
  const dir = directory(t), processor = new Processor();
  const joined = join(dir,'joined.tft');
  processor.writePipelineToFile(processor.register(new Pipeline().addToEnd(' joined')),joined);
  const id = processor.register(new Pipeline().tryIgnore(new Pipeline().deleteSingle(9)).onLine(0,new Pipeline().addToEnd('!')).pipelineJoin(joined));
  assert.equal(processor.processAll(id,'abc'),'abc! joined');
  assert.deepEqual(processor.getTransformVec(id).map(i => [i.name,i.arguments.length]),[['tryi',1],['onln',2],['ppjn',1]]);
  for (const [file, read, write] of [
    [join(dir,'plan.tft'),'getPipelineFromFile','writePipelineToFile'],
    [join(dir,'plan.tfb'),'readFromBytecodeFile','writeToBytecodeFile'],
  ] as const) {
    processor[write](id,file);
    assert.equal(processor.processAll(processor[read](file),'abc'),'abc! joined');
  }
  // A processor reads the joined file when the plan is registered.
  assert.throws(() => processor.register(new Pipeline().pipelineJoin(join(dir,'missing.tft'))),TextForgeError);
});
