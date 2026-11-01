"""Check public method mappings against pinned Rust and explicit TypeScript source."""
from pathlib import Path
import re
import json
import sys
ROOT=Path(__file__).resolve().parents[1]
core=ROOT/'vendor/textforge'
ts=(ROOT/'ts/index.ts').read_text()
def camel(name):
 first,*rest=name.split('_');return first+''.join(p.capitalize() for p in rest)
processor=(core/'src/api/processor.rs').read_text().split('impl Default for TextForgeProcessor')[0]
names=set(re.findall(r'^    fn (\w+)',processor,re.M))
# Buffered methods live in an additional public processor trait.
for path in (core/'src/api/processor/buffered').glob('*.rs'):
 text=path.read_text()
 if 'pub trait' in text: names.update(re.findall(r'^    fn (\w+)\(',text,re.M))
# Include public inherent processor methods and feature-gated extension modules.
full=(core/'src/api/processor.rs').read_text()
names.update(re.findall(r'^    pub fn (\w+)',full,re.M))
for filename in ['buffered.rs','file_io.rs']:
    text=(core/'src/api/processor'/filename).read_text()
    for block in text.split('impl TextForgeProcessor {')[1:]:
        names.update(re.findall(r'^    pub fn (\w+)',block,re.M))
names.discard('default')
mapping=[]
for name in sorted(names):
 js='constructor' if name=='new' else camel(name)
 if name=='new': portable='PortableProcessor::new'
 elif name=='create_pipeline': portable='PortableProcessor::create_pipeline / register'
 else: portable='PortableProcessor::'+name
 assert re.search(r'\b'+re.escape(js)+r'\(',ts),f'Missing public processor method: {name}'
 mapping.append({'rust':name,'portable':portable,'javascript':js})
# Verify all portable instance methods are represented (including additions).
for source in ['processor.rs','buffered.rs','watchers.rs']:
 text=(core/'src/api/portable'/source).read_text()
 for block in text.split('impl PortableProcessor {')[1:]:
  # No subsequent impl blocks in the portable processor blocks today.
  for name in re.findall(r'    pub fn (\w+)\(',block):
   assert name=='new' or re.search(r'\b'+camel(name)+r'\(',ts),f'Missing portable method {name}'
builder=json.loads((ROOT/'docs/builder-parity.json').read_text())
fixtures=json.loads((ROOT/'tests/fixtures/builder_reference.json').read_text())
covered={c['name'] for c in fixtures}
for method in builder['methods']:
 assert method['rust'] in covered,f'Missing native builder fixture: {method["rust"]}'
output=json.dumps({'coreVersion':'0.2.0','methods':mapping},indent=2)+'\n'
p=ROOT/'docs/processor-parity.json'
if '--write' in sys.argv:p.write_text(output)
else:assert p.read_text()==output,'Stale processor mapping'
print(f'Verified {len(mapping)} public processor mappings and {len(builder["methods"])} fluent methods')
