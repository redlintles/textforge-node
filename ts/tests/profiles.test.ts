// Execution profiles and pipeline names (TextForge 0.3.0 processor methods).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ExecutionProfile,Pipeline,Processor,TextForgeError} from '../index.js';

test('presets carry the core values and the default is balanced', () => {
  assert.equal(ExecutionProfile.balanced().spoolThreshold,1024n * 1024n);
  assert.equal(ExecutionProfile.lowMemory().spoolThreshold,64n * 1024n);
  assert.equal(ExecutionProfile.fast().spoolThreshold,256n * 1024n * 1024n);
  for (const profile of [ExecutionProfile.balanced(),ExecutionProfile.preset('low-memory')]) {
    assert.equal(profile.maxGeneratedBytes,2n * 1024n ** 3n); assert.equal(profile.maxIterations,10_000_000n);
  }
  assert.ok(new Processor().profile().equals(ExecutionProfile.balanced()));
  assert.ok(new ExecutionProfile({spoolThreshold:1024 * 1024}).equals(ExecutionProfile.balanced()));
  assert.throws(() => ExecutionProfile.preset('huge' as 'fast'),/unknown profile/);
});

test('limits stop runaway work and never change results within them', () => {
  const profile = new ExecutionProfile({spoolThreshold:4096,maxGeneratedBytes:8});
  const processor = new Processor().withProfile(profile);
  assert.ok(processor.profile().equals(profile));
  const id = processor.register(new Pipeline().repeat(3));
  assert.equal(processor.processAll(id,'ab'),'ababab');
  assert.throws(() => processor.processAll(id,'abc'),
    e => e instanceof TextForgeError && e.code === 31 && e.kind === 'LimitExceededError' && !e.ignorable);
  processor.setProfile(profile.unlimited());
  assert.equal(processor.profile().maxGeneratedBytes,null); assert.equal(processor.profile().maxIterations,null);
  assert.equal(processor.processAll(id,'abc'),'abcabcabc');
  const iterations = new Processor().withProfile(ExecutionProfile.balanced().withLimits({maxGeneratedBytes:null,maxIterations:2}));
  const loop = iterations.register(new Pipeline().iter(3,new Pipeline().addToEnd('!')));
  assert.throws(() => iterations.processAll(loop,'x'),e => e instanceof TextForgeError && e.code === 31);
});

test('profile arguments are checked without coercion', () => {
  for (const value of [-1,1.5,1n << 64n]) assert.throws(() => new ExecutionProfile({spoolThreshold:value}),RangeError);
  assert.throws(() => new ExecutionProfile({spoolThreshold:4096,maxIterations:-1}),RangeError);
  assert.throws(() => new Processor().setProfile({} as ExecutionProfile),TypeError);
  assert.ok(Object.isFrozen(ExecutionProfile.fast()));
});

test('pipelines read their name as __PIPELINE_NAME__', t => {
  const processor = new Processor();
  const id = processor.register(new Pipeline().addToEnd('@{{__PIPELINE_NAME__}}'));
  assert.equal(processor.pipelineName(id),id);
  processor.setPipelineName(id,'limpeza 🍌');
  assert.equal(processor.pipelineName(id),'limpeza 🍌');
  assert.equal(processor.processAll(id,'run'),'run@limpeza 🍌');
  assert.throws(() => processor.pipelineName('missing'),TextForgeError);
  assert.throws(() => processor.setPipelineName('missing','x'),TextForgeError);
  const dir = mkdtempSync(join(tmpdir(),'textforge-node-names-')); t.after(() => rmSync(dir,{recursive:true,force:true}));
  const file = join(dir,'cleanup.tft'); processor.writePipelineToFile(id,file);
  const restored = processor.getPipelineFromFile(file);
  assert.notEqual(processor.pipelineName(restored),restored);
  assert.equal(processor.processAll(restored,'run'),'run@' + processor.pipelineName(restored));
});
