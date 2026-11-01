import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Pipeline,Instruction,Variable,TextForgeError} from '../index.js';
type Step = [string, unknown[]];
type Case = {name:string;input:string;steps:Step[];result:{ok?:string;error?:number}};
function camel(value: string): string { return value.replace(/_([a-z])/g,(_,c:string) => c.toUpperCase()); }
function argument(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const v=value as {variable?:string;instruction?:[string,unknown[]];body?:Step[]};
  if (v.variable) return new Variable(v.variable);
  if (v.instruction) {
    const [name,args]=v.instruction;
    return new Pipeline()[camel(name) as 'addToBeginning'](...args.map(argument) as [string]);
  }
  if (v.body) return chain(v.body);
  throw new TypeError('unknown fixture argument');
}
function chain(steps: Step[]): Pipeline {
  let plan=new Pipeline();
  for (const [name,args] of steps) {
    const method=(plan as unknown as Record<string,(...args:unknown[])=>Pipeline>)[camel(name)];
    assert.ok(method,`missing method ${name}`); plan=method.apply(plan,args.map(argument));
  }
  return plan;
}
const fixtures=JSON.parse(readFileSync(new URL('../../../tests/fixtures/builder_reference.json',import.meta.url),'utf8')) as Case[];
for (const fixture of fixtures) test(`public Rust builder parity: ${fixture.name}`,() => {
  if ('ok' in fixture.result) assert.equal(chain(fixture.steps).compile().process(fixture.input),fixture.result.ok);
  else assert.throws(() => chain(fixture.steps).compile().process(fixture.input),e => e instanceof TextForgeError && e.code===fixture.result.error);
});
test('nested instruction snapshots preserve typed owned values',() => {
  const nested=new Instruction('iter',2n,new Instruction('atb','🍌'));
  assert.equal(new Pipeline(nested).compile().process('é'),'🍌🍌é');
});

import {Processor,Observers,BufferOptions,PortableBuffer} from '../index.js';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
type Reference = {ok?:string;error?:{stage:string;code:number;message:string;instruction:string;input:string}};
const processorReference=JSON.parse(readFileSync(new URL('../../../tests/fixtures/processor_reference.json',import.meta.url),'utf8')) as {cases:Record<string,Reference>};
test('native Rust processor results and complete portable diagnostics', t => {
  const dir=mkdtempSync(join(tmpdir(),'textforge-parity-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const processor=new Processor();const id=processor.register(new Pipeline().addToBeginning('🍌').addToEnd('é'));
  const observers=new Observers();t.after(()=>observers.close());
  const paths={text:join(dir,'pipeline.textforge'),bytecode:join(dir,'pipeline.textforgebc'),report:join(dir,'report.json')};
  const results: Record<string,()=>string>={
    unicode:()=>processor.processAll(id,'e\u0301\0'), empty:()=>processor.processAll(id,''),
    missing_id:()=>processor.processAll('missing','x'),
    missing_snapshot:()=>String(processor.getTransformVec('missing').length),
    missing_remove:()=>{processor.removeTransform('missing');return '';},
    missing_variable:()=>new Pipeline().repeat(new Variable('missing')).compile().process('é'),
    invalid_regex:()=>new Pipeline().removePattern('[').compile().process('é'),
    unknown:()=>{new Pipeline().add('unknown').compile();return '';},
    arity:()=>{new Pipeline().add('atb').compile();return '';},
    parameter_type:()=>{new Pipeline().add('atb',1).compile();return '';},
    persistence_missing:()=>{processor.writePipelineToFile('missing',paths.text);return '';},
    text_roundtrip:()=>{writeFileSync(paths.text,'');processor.writePipelineToFile(id,paths.text);return processor.processAll(processor.getPipelineFromFile(paths.text),'x');},
    bytecode_roundtrip:()=>{writeFileSync(paths.bytecode,'');processor.writeToBytecodeFile(id,paths.bytecode);return processor.processAll(processor.readFromBytecodeFile(paths.bytecode),'x');},
    buffered:()=>processor.processAllBuffered(id,PortableBuffer.fromText('x',new BufferOptions(1,dir))).intoString(),
    watched:()=>{observers.setBuiltin('size','current_len_chars');observers.scheduleAll('size');return processor.processAllWithWatchers(id,'x',observers,paths.report);},
    report:()=>readFileSync(paths.report,'utf8'),
    callback_error:()=>{const o=new Observers();try{o.set('bad',()=>{throw new Error('boom');});o.scheduleAll('bad');return processor.processAllWithWatchers(processor.register(new Pipeline().addToBeginning('🍌')),'x',o,join(dir,'failed.json'));}finally{o.close();}},
    builtin_error:()=>{observers.setBuiltin('x','missing');return '';},
    invalid_utf8:()=>{let sent=false;PortableBuffer.fromReader(()=>{if(sent)return Buffer.alloc(0);sent=true;return Buffer.from([255]);},new BufferOptions(1,dir));return '';},
  };
  const lineCases:Record<string,[string,unknown[]]>={
    append_line_multiline:['appendLine',['x\ny']],prepend_line_multiline:['prependLine',['x\ny']],
    insert_line_multiline:['insertLine',[1,'x\ny']],replace_line_multiline:['replaceLine',[1,'x\ny']],
    keep_lines_matching_regex:['keepLinesMatching',['[']],delete_lines_matching_regex:['deleteLinesMatching',['[']],
  };
  for(const [snake,method] of [['delete_line','deleteLine'],['delete_lines_after','deleteLinesAfter'],['delete_lines_before','deleteLinesBefore']]) {
    // Only cases emitted by the native oracle are checked below.
    for(const [suffix,value] of [['zero',0],['missing',100]] as const) lineCases[`${snake}_${suffix}`]=[method!,[value]];
  }
  for(const [snake,method] of [['insert_line','insertLine'],['replace_line','replaceLine']])
    for(const [suffix,value] of [['zero',0],['missing',100]] as const) lineCases[`${snake}_${suffix}`]=[method!,[value,'x']];
  for(const [snake,method] of [['select_lines','selectLines'],['delete_lines_interval','deleteLinesInterval']])
    for(const [suffix,start,end] of [['zero',0,1],['missing',1,100],['inverted',2,1]] as const) lineCases[`${snake}_${suffix}`]=[method!,[start,end]];
  for(const [name,[method,args]] of Object.entries(lineCases)) results['line_'+name]=()=>{
    const plan=new Pipeline();const fn=(plan as unknown as Record<string,(...args:unknown[])=>Pipeline>)[method]!;
    return fn.apply(plan,args).compile().process('a\nb');
  };
  for(const [name,expected] of Object.entries(processorReference.cases)) {
    assert.ok(results[name],`missing processor reference: ${name}`);
    if('ok' in expected) assert.equal(results[name]!(),expected.ok,name);
    else assert.throws(results[name]!,e=>{
      assert.ok(e instanceof TextForgeError,name);
      assert.deepEqual({stage:e.stage,code:e.code,message:e.message,instruction:e.instruction,input:e.input},expected.error,name);
      return true;
    });
  }
});
