// Error details added by TextForge 0.4.0 (portable BindingErrorDetails).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Instruction,Pipeline,Processor,TextForgeError} from '../index.js';

function caught(run: () => unknown): TextForgeError {
  try { run(); } catch (error) { if (error instanceof TextForgeError) return error; throw error; }
  throw new assert.AssertionError({message:'expected a TextForgeError'});
}

test('an execution error carries kind, trace, parameters, hint and report', () => {
  const inner = new Pipeline().pushToken(new Instruction('dls','[[__COUNTER__ + 8]]'));
  const error = caught(() => new Pipeline().iter(2,inner).compile().process('abc'));
  assert.equal(error.stage,'execution'); assert.equal(error.code,12); assert.equal(error.kind,'IndexOutOfRange');
  assert.equal(error.trace.length,2);
  assert.match(error.trace[0]!.instruction,/^iter 2 times/);
  assert.match(error.trace[0]!.note ?? '',/iteration 1 of 2/);
  assert.deepEqual(error.trace[1],{instruction:'dls 8;',location:null,note:null});
  assert.deepEqual(error.parameters,[{name:'index',value:'8',written:'"[[__COUNTER__ + 8]]"'}]);
  assert.equal(error.cause,null); assert.equal(typeof error.hint,'string');
  assert.equal(error.ignorable,true);
  assert.ok(error.report.startsWith('error[12] IndexOutOfRange: '));
  assert.ok(!error.report.includes('\u001b'),'the report is not colored');
  assert.ok(!error.message.includes('\u001b'));
});

test('errors outside a run have a kind and empty trace and parameters', () => {
  const error = caught(() => new Pipeline().add('missing').compile());
  assert.equal(error.stage,'conversion'); assert.equal(error.kind,'TokenNotFound');
  assert.deepEqual(error.trace,[]); assert.deepEqual(error.parameters,[]);
  assert.ok(error.report.startsWith('error[2] TokenNotFound: '));
  const persistence = caught(() => new Processor().getPipelineFromFile(join(tmpdir(),'textforge-missing-pipeline.tft')));
  assert.equal(persistence.stage,'persistence'); assert.equal(persistence.kind,'ValidationError');
});

test('safety limits have code 31 and are not ignorable', () => {
  const error = caught(() => new Pipeline().repeat(3_000_000_000).compile().process('x'));
  assert.equal(error.code,31); assert.equal(error.kind,'LimitExceededError'); assert.equal(error.ignorable,false);
});

test('batch results carry the same details as thrown errors', t => {
  const dir = mkdtempSync(join(tmpdir(),'textforge-node-errors-')); t.after(() => rmSync(dir,{recursive:true,force:true}));
  const input = join(dir,'input.txt'); writeFileSync(input,'abc');
  const processor = new Processor(), id = processor.register(new Pipeline().deleteSingle(9));
  const [missing, failed] = processor.processBatch([
    {pipelineId:id,input:join(dir,'absent.txt'),output:join(dir,'a.txt')},
    {pipelineId:id,input,output:join(dir,'b.txt')},
  ]);
  assert.ok(missing instanceof TextForgeError); assert.equal(missing.kind,'FileNotFound'); assert.equal(missing.cause,null);
  assert.ok(failed instanceof TextForgeError); assert.equal(failed.kind,'IndexOutOfRange');
  assert.deepEqual(failed.parameters.map(p => p.name),['index']);
  assert.ok(failed.report.startsWith('error[12] IndexOutOfRange: '));
});
