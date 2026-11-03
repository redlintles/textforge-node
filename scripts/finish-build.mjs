import {copyFileSync,readFileSync,writeFileSync} from 'node:fs';
writeFileSync('dist/cjs/package.json','{"type":"commonjs"}\n');
// ESM is a static facade over the CommonJS implementation. Building two copies
// of classes with private fields breaks instanceof and mixed-module arguments.
for (const extension of ['js','d.ts']) {
  const entry=readFileSync(`dist/esm/entry.${extension}`,'utf8');
  writeFileSync(`dist/esm/index.${extension}`,entry.replaceAll("'./index.js'","'../cjs/index.js'"));
}
for (const format of ['esm','cjs']) copyFileSync('ts/native-types.d.ts',`dist/${format}/native-types.d.ts`);
copyFileSync('native/textforge_node.node','native.node');
