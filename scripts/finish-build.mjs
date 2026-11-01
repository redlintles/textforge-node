import { copyFileSync, writeFileSync } from 'node:fs';
writeFileSync('dist/cjs/package.json', '{"type":"commonjs"}\n');
for (const format of ['esm','cjs']) copyFileSync('ts/native-types.d.ts', `dist/${format}/native-types.d.ts`);
copyFileSync('native/textforge_node.node', 'native.node');
