import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as api from '../index.js';
const {Pipeline,CompiledPipeline,Processor,Instruction,Variable,FilePath,PortableBuffer,BufferOptions,Observers,TextForgeError}=api;
const cjs:typeof api=createRequire(import.meta.url)('../../../dist/cjs/index.js');
function directory(t:{after(fn:()=>void):void}):string {
  const result=mkdtempSync(join(tmpdir(),'textforge usage with spaces '));
  t.after(()=>rmSync(result,{recursive:true,force:true}));return result;
}

test('registration accepts external plans, compiled plans and instruction snapshots',()=>{
  const plan=new Pipeline().trimBothSides().addToBeginning('Banana ').addToEnd('!')
    .blockAssoc('banana',new Pipeline().toReverse().toLowercaseAll().replaceAllWith('a','o')).callBlock('banana');
  const processor=new Processor();
  const expected=plan.compile().process(' é ');
  for(const source of [plan,plan.compile()]) for(const method of ['register','addTransform'] as const){
    const id=processor[method](source);
    assert.equal(processor.processAll(id,' é '),expected);
    processor.removeTransform(id);
    assert.equal(source instanceof CompiledPipeline?source.process(' é '):source.compile().process(' é '),expected);
  }
  const id=processor.register([new Instruction('atb','Banana '),new Instruction('ate','!')]);
  assert.equal(processor.processAll(id,'é'),'Banana é!');
  const snapshot=processor.getTransformVec(id);
  const second=new Processor();assert.equal(second.processAll(second.addTransform(snapshot),'é'),'Banana é!');
  assert.equal(processor.processSingle(new Pipeline().addToEnd('!'),'é'),'é!');
});

test('ESM and CommonJS share class identities and can exchange every object type',t=>{
  for(const name of ['Pipeline','CompiledPipeline','Instruction','Variable','Processor','FilePath','Observers','PortableBuffer','BufferOptions','BatchPool'] as const)
    assert.equal(api[name],cjs[name],name);
  const plan=new Pipeline(new cjs.Instruction('atb','🍌')).var('n','2').repeat(new cjs.Variable('n'));
  const processor=new cjs.Processor();const id=processor.register(plan.compile());
  assert.equal(processor.processAll(id,'é'),'🍌é🍌é');
  const dir=directory(t);
  processor.writeToBytecodeFile(id,cjs.FilePath.fromText(join(dir,'pipeline.tfb')));
  assert.equal(processor.processAll(processor.readFromBytecodeFile(FilePath.fromText(join(dir,'pipeline.tfb'))),'é'),'🍌é🍌é');
  const buffer=cjs.PortableBuffer.fromText('é',new BufferOptions(1,dir));
  assert.equal(processor.processAllBuffered(id,buffer).intoString(),'🍌é🍌é');
  const observers=new cjs.Observers();t.after(()=>observers.close());observers.set('x',o=>o.current);observers.scheduleAll('x');
  assert.equal(new Processor().processSingle(new cjs.Instruction('atb','🍌'),'é'),'🍌é');
  assert.equal(processor.processAllWithWatchers(id,'é',observers,join(dir,'report.json')),'🍌é🍌é');
});

test('all write APIs create new destinations and nested parents',t=>{
  const dir=directory(t),processor=new Processor(),id=processor.register(new Pipeline().addToEnd('!'));
  for(const extension of ['tft','textforge','tfb','textforgebc']){
    const destination=join(dir,'nested',extension,'pipeline.'+extension);
    assert.equal(existsSync(destination),false);
    const binary=['tfb','textforgebc'].includes(extension);
    if(binary)processor.writeToBytecodeFile(id,pathToFileURL(destination));
    else processor.writePipelineToFile(id,pathToFileURL(destination));
    const restored=binary?processor.readFromBytecodeFile(destination):processor.getPipelineFromFile(destination);
    assert.equal(processor.processAll(restored,'é'),'é!');
    if(binary)assert.deepEqual([...readFileSync(destination).subarray(0,8)],[38,235,245,8,244,137,1,179]);
  }
  const observers=new Observers();t.after(()=>observers.close());observers.setBuiltin('size','current_len_chars');observers.scheduleAll('size');
  processor.processAllWithWatchers(id,'é',observers,join(dir,'reports','new','report.json'));
  observers.run({current:'é',before:'',instruction:'ate'});observers.writeReport(join(dir,'manual','report.json'));
  const buffer=PortableBuffer.fromText('é',new BufferOptions(1,dir));
  assert.equal(buffer.writeToFile(join(dir,'buffers','new','output.txt')),2n);buffer.close();
  const input=join(dir,'input.txt');writeFileSync(input,'é');
  processor.processFile(id,input,join(dir,'processed','output.txt'));
  assert.deepEqual(processor.processBatch([{pipelineId:id,input,output:join(dir,'batch','output.txt')}]),[null]);
});

test('text persistence round-trips whitespace, quotes, backslashes, empty and nested arguments',t=>{
  const dir=directory(t),processor=new Processor();
  const cases=[
    new Pipeline().addToBeginning('Banana ').addToEnd('!'),
    new Pipeline().addToBeginning(''),
    new Pipeline().addToBeginning('é\0🍌'),
    new Pipeline().replaceAllWith('a b','"quoted" \\ 🍌'),
    new Pipeline().blockAssoc('named block',p=>p.addToBeginning("a'b \\")).callBlock('named block'),
    new Pipeline().iter(2,new Pipeline().addToEnd(' two words ')),
    new Pipeline().var('prefix','hello world ').addToBeginning(new Variable('prefix')),
    new Pipeline().val('n',2).repeat(new Variable('n')),
  ];
  for(const [index,plan] of cases.entries()){
    const id=processor.register(plan),file=join(dir,`plan${index}.tft`);
    processor.writePipelineToFile(id,file);
    const restored=processor.getPipelineFromFile(file);
    for(const input of ['', 'a b é🍌','e\u0301\0'])assert.equal(processor.processAll(restored,input),plan.compile().process(input));
  }
});

test('invalid writes preserve previous content and multiline values use bytecode losslessly',t=>{
  const dir=directory(t),processor=new Processor();
  const file=join(dir,'pipeline.tft');writeFileSync(file,'original');
  assert.throws(()=>processor.writePipelineToFile('missing',file),e=>e instanceof TextForgeError&&e.stage==='persistence');
  assert.equal(readFileSync(file,'utf8'),'original');
  const id=processor.register(new Pipeline().addToBeginning('line 1\nline 2'));
  assert.throws(()=>processor.writePipelineToFile(id,file),e=>e instanceof TextForgeError&&e.stage==='persistence'&&/bytecode/i.test(e.message));
  assert.equal(readFileSync(file,'utf8'),'original');
  const binary=join(dir,'multiline.tfb');processor.writeToBytecodeFile(id,binary);
  assert.equal(processor.processAll(processor.readFromBytecodeFile(binary),'é'),'line 1\nline 2é');
  assert.throws(()=>processor.writePipelineToFile(id,join(dir,'new','pipeline.tft')));
  assert.equal(existsSync(join(dir,'new')),false);
  const valid=processor.register(new Pipeline().addToEnd('!'));
  assert.throws(()=>processor.writePipelineToFile(valid,join(dir,'bad','pipeline.txt')),e=>e instanceof TextForgeError&&/\.tft/.test(e.message));
  assert.equal(existsSync(join(dir,'bad')),false);
  writeFileSync(join(dir,'blocker'),'data');
  assert.throws(()=>processor.writeToBytecodeFile(valid,join(dir,'blocker','pipeline.tfb')),e=>e instanceof TextForgeError&&e.stage==='persistence'&&e.instruction!=='canonicalize');
  assert.equal(readFileSync(join(dir,'blocker'),'utf8'),'data');
  assert.deepEqual(readdirSync(dir).sort(),['blocker','multiline.tfb','pipeline.tft']);
});

test('invalid JavaScript arguments fail at the public boundary with actionable errors',()=>{
  const processor=new Processor();
  for(const value of [null,{},42,'an-id',()=>{},[{}],new Array(1)]){
    assert.throws(()=>processor.register(value as api.Pipeline),e=>e instanceof TypeError&&!/lower|toNative|\.map/.test(e.message));
    assert.throws(()=>processor.addTransform(value as api.Pipeline),TypeError);
  }
  assert.throws(()=>processor.processSingle({} as api.Instruction,'é'),TypeError);
  assert.throws(()=>FilePath.fromNativeBytes('path' as unknown as Uint8Array),TypeError);
  assert.throws(()=>PortableBuffer.fromReader(null as unknown as api.StreamReader),TypeError);
  const observers=new Observers();try{assert.throws(()=>observers.set('x',null as unknown as api.Observer),TypeError);}finally{observers.close();}
  const buffer=PortableBuffer.fromText('é');try{assert.throws(()=>buffer.copyTo(null as unknown as api.StreamWriter),TypeError);}finally{buffer.close();}
  assert.throws(()=>processor.processBatch(null as unknown as api.FileTask[]),TypeError);
  assert.throws(()=>processor.processBatch([null] as unknown as api.FileTask[]),TypeError);
  assert.throws(()=>processor.processAllBuffered('x',{} as api.PortableBuffer),TypeError);
});


test('bytecode preserves reference names outside the textual grammar',t=>{
  const dir=directory(t),processor=new Processor();
  const id=processor.register(new Pipeline().var('n_value',2).repeat(new Variable('n_value')));
  const binary=join(dir,'pipeline.tfb');processor.writeToBytecodeFile(id,binary);
  assert.equal(processor.processAll(processor.readFromBytecodeFile(binary),'é'),'éé');
  assert.throws(()=>processor.writePipelineToFile(id,join(dir,'pipeline.tft')),e=>e instanceof TextForgeError&&/bytecode/.test(e.message));
  assert.equal(existsSync(join(dir,'pipeline.tft')),false);
});

test('pipeline export preserves non-UTF-8 Unix destination names',t=>{
  if(process.platform==='win32'){t.skip('Unix native path representation');return;}
  const dir=directory(t),processor=new Processor(),id=processor.register(new Pipeline().addToEnd('🍌'));
  const bytes=Buffer.concat([Buffer.from(dir+'/'),Buffer.from([255]),Buffer.from('/pipeline.tft')]);
  const destination=FilePath.fromNativeBytes(bytes);
  assert.equal(destination.toText(),null);
  processor.writePipelineToFile(id,destination);
  assert.equal(processor.processAll(processor.getPipelineFromFile(destination),'é'),'é🍌');
  assert.ok(readFileSync(bytes).length>0);
});


test('buffer spooling creates the configured storage directory and cleans up files',t=>{
  const dir=directory(t),storage=join(dir,'new','spill directory');
  const buffer=PortableBuffer.fromText('é🍌',new BufferOptions(1,storage));
  assert.equal(buffer.isSpilled(),true);
  assert.deepEqual(buffer.readAt(0,6),Buffer.from('é🍌'));
  assert.equal(existsSync(storage),true); // Linux may use an unnamed temporary file.
  buffer.close();assert.deepEqual(readdirSync(storage),[]);
  writeFileSync(join(dir,'blocker'),'data');
  assert.throws(()=>PortableBuffer.fromText('é',new BufferOptions(1,join(dir,'blocker'))),e=>e instanceof TextForgeError&&e.instruction==='BufferOptions.spill_directory');
});
