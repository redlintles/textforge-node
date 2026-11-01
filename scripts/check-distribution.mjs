/** Validate the actual platform package in an independent installed project. */
import {mkdtempSync,cpSync,readFileSync,writeFileSync,readdirSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve('.');
const temporary=mkdtempSync(join(tmpdir(),'textforge-distribution-'));
const npm=process.platform==='win32'?'npm.cmd':'npm';
function run(command,args,cwd) {
  execFileSync(command,args,{cwd,stdio:'inherit',shell:process.platform==='win32' && command===npm,env:process.env});
}
try {
  let build=root;
  if(process.argv.includes('--source')) {
    run(process.platform==='win32'?'python':'python3',['scripts/source-archive.py',join(temporary,'source.tar.gz'),join(temporary,'source')],root);
    build=join(temporary,'source');
    run(npm,['ci','--ignore-scripts','--no-audit','--no-fund'],build);
    run(npm,['run','build'],build);
  }
  const staging=join(temporary,'package');mkdirSync(staging);
  const manifest=JSON.parse(readFileSync(join(build,'package.json'),'utf8'));
  manifest.os=[process.platform];manifest.cpu=[process.arch];
  if(process.platform==='linux') manifest.libc=['glibc'];
  // The tarball contains an already built native addon, with no installation hook.
  for(const file of manifest.files) cpSync(join(build,file),join(staging,file),{recursive:true});
  delete manifest.devDependencies;
  writeFileSync(join(staging,'package.json'),JSON.stringify(manifest,null,2));
  run(npm,['pack','--ignore-scripts','--pack-destination',temporary],staging);
  const archive=readdirSync(temporary).find(p=>p.endsWith('.tgz'));
  const consumer=join(temporary,'consumer');mkdirSync(consumer);
  writeFileSync(join(consumer,'package.json'),'{"private":true,"type":"module"}\n');
  run(npm,['install','--ignore-scripts','--no-audit','--no-fund',join(temporary,archive),'@types/node@22'],consumer);
  const installed=join(consumer,'node_modules',manifest.name);
  const tests=readdirSync(join(installed,'dist/esm/tests')).filter(p=>p.endsWith('.test.js')).map(p=>join(installed,'dist/esm/tests',p));
  for (const file of tests) run(process.execPath,[file],consumer);
  const esm=`import {Pipeline,Processor,PortableBuffer,TextForgeError} from '${manifest.name}';
const processor=new Processor(); const id=processor.createPipeline().addToBeginning('🍌').deleteLine(1n).build();
const output:string=processor.processAll(id,'é');
const length:bigint=PortableBuffer.fromText(output).lenBytes();
// @ts-expect-error booleans are not integers
new Pipeline().repeat(true);
// @ts-expect-error methods use camelCase
new Pipeline().add_to_beginning('x');
void length; void TextForgeError;
`;
  writeFileSync(join(consumer,'consumer.mts'),esm);
  writeFileSync(join(consumer,'consumer.cts'),esm.replace(`import {Pipeline,Processor,PortableBuffer,TextForgeError} from '${manifest.name}';`,`import binding = require('${manifest.name}');\nconst {Pipeline,Processor,PortableBuffer,TextForgeError}=binding;`));
  run(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','consumer.mts','consumer.cts'],consumer);
  console.log(`Verified installed ${manifest.name} ${manifest.version}: ESM, CommonJS, declarations${build===root?'':' and independent source rebuild'}`);
} finally {
  rmSync(temporary,{recursive:true,force:true});
}
