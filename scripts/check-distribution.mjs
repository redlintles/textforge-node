/** Validate the actual platform package in an independent installed project. */
import {existsSync,mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve('.');
const temporary=mkdtempSync(join(tmpdir(),'textforge distribution '));
// Invoke npm through Node to preserve paths containing spaces on Windows too.
const candidates=[process.env.npm_execpath,
  join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),
  join(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')];
const npmCli=candidates.find(file=>file&&existsSync(file));
if(!npmCli)throw new Error('Cannot locate npm; invoke this check through npm run test:distribution');
function run(command,args,cwd) {
  const executable=command==='npm'?process.execPath:command;
  const parameters=command==='npm'?[npmCli,...args]:args;
  execFileSync(executable,parameters,{cwd,stdio:'inherit',env:process.env});
}
try {
  let build=root;
  if(process.argv.includes('--source')) {
    run(process.platform==='win32'?'python':'python3',['scripts/source-archive.py',join(temporary,'source.tar.gz'),join(temporary,'source')],root);
    build=join(temporary,'source');
    run('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],build);
  }
  const manifest=JSON.parse(readFileSync(join(build,'package.json'),'utf8'));
  // Exercise exactly the maintainer workflow: npm pack must build missing
  // artifacts itself via prepack. No staging manifest or ignored hooks mask bugs.
  run('npm',['pack','--pack-destination',temporary],build);
  const archive=readdirSync(temporary).find(p=>p.endsWith('.tgz'));
  const consumer=join(temporary,'consumer');mkdirSync(consumer);
  writeFileSync(join(consumer,'package.json'),'{"private":true,"type":"module"}\n');
  run('npm',['install','--ignore-scripts','--no-audit','--no-fund',join(temporary,archive),'@types/node@22'],consumer);
  const installed=join(consumer,'node_modules',manifest.name);
  const tests=readdirSync(join(installed,'dist/esm/tests')).filter(p=>p.endsWith('.test.js')).map(p=>join(installed,'dist/esm/tests',p));
  for (const file of tests) run(process.execPath,[file],consumer);
  const smoke=`import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as esm from '${manifest.name}';
const cjs=createRequire(import.meta.url)('${manifest.name}');
assert.equal(esm.Pipeline,cjs.Pipeline);
const plan=new esm.Pipeline().trimBothSides().addToBeginning('Banana ').addToEnd('!')
  .blockAssoc('banana',new cjs.Pipeline().toReverse().toLowercaseAll().replaceAllWith('a','o')).callBlock('banana');
const processor=new cjs.Processor();
for(const source of [plan,plan.compile()]) {
  const id=processor.register(source);
  assert.equal(processor.processAll(id,' é '),'!é ononob');
  processor.writePipelineToFile(id,'new folder/pipeline.tft');
  processor.writeToBytecodeFile(id,'new folder/pipeline.tfb');
  assert.equal(processor.processAll(processor.getPipelineFromFile('new folder/pipeline.tft'),' é '),'!é ononob');
  assert.equal(processor.processAll(processor.readFromBytecodeFile('new folder/pipeline.tfb'),' é '),'!é ononob');
}
`;
  writeFileSync(join(consumer,'smoke.mjs'),smoke);
  run(process.execPath,['smoke.mjs'],consumer);
  const esm=`import {Pipeline,Processor,PortableBuffer,TextForgeError,Instruction} from '${manifest.name}';
const processor=new Processor(); const id=processor.createPipeline().addToBeginning('🍌').deleteLine(1n).build();
const output:string=processor.processAll(id,'é');
const length:bigint=PortableBuffer.fromText(output).lenBytes();
// @ts-expect-error booleans are not integers
new Pipeline().repeat(true);
// @ts-expect-error methods use camelCase
new Pipeline().add_to_beginning('x');
const external=new Pipeline().addToEnd('!');
processor.addTransform(external);
processor.register(external.compile());
processor.register([new Instruction('ate','!')]);
void length; void TextForgeError;
`;
  writeFileSync(join(consumer,'consumer.mts'),esm);
  writeFileSync(join(consumer,'consumer.cts'),esm.replace(`import {Pipeline,Processor,PortableBuffer,TextForgeError,Instruction} from '${manifest.name}';`,`import binding = require('${manifest.name}');\nconst {Pipeline,Processor,PortableBuffer,TextForgeError,Instruction}=binding;`));
  run(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','consumer.mts','consumer.cts'],consumer);
  console.log(`Verified installed ${manifest.name} ${manifest.version}: ESM, CommonJS, declarations${build===root?'':' and independent source rebuild'}`);
} finally {
  rmSync(temporary,{recursive:true,force:true});
}
