"""Generate explicit TypeScript builder methods and parity mapping from pinned core.

Run `python3 scripts/generate-builder.py` after `cargo fetch`; CI uses --check.
No runtime method generation is used.
"""
from pathlib import Path
import re
import os
import sys
import json
import hashlib

ROOT = Path(__file__).resolve().parents[1]
CARGO = Path(os.environ.get('CARGO_HOME', Path.home() / '.cargo'))
CORE = ROOT / 'vendor/textforge'
api = (CORE / 'src/api/mod.rs').read_text()
registry = (CORE / 'src/globals/table.rs').read_text()
syntax = {m[1]: re.findall(r'SyntaxToken::(String|Usize|Token)\b',m[2]) for m in re.finditer(r'(?s)\(\s*"(\w+)",\s*0x[0-9a-fA-F]+,.*?\[([^\]]*)\]\s*,?\s*\)',registry)}
def camel(value):
    head,*tail=value.split('_')
    return head+''.join(p.capitalize() for p in tail)
methods=[]
mapping=[]
trait=api.split('pub trait TextForgeConditionalMethods')[0]
for m in re.finditer(r'(?ms)^    fn (\w+)\(([^;]*?)\) -> Result<&mut Self, TextForgeError> \{\n(.*?)^    }',trait):
    name,signature,implementation=m.groups()
    token=re.search(r'Box::new\((\w+)::',implementation)[1]
    parameters=re.findall(r'(\w+): impl Into<ValType>',signature)
    kinds=syntax[token]
    if len(parameters)!=len(kinds): raise ValueError(name)
    typed=[];values=[]
    for param,kind in zip(parameters,kinds,strict=True):
        annotation,converter={'String':('TextArgument','textArg'),'Usize':('NumberArgument','numberArg'),'Token':('InstructionArgument','instructionArg')}[kind]
        if name in {'val','var','mut_var'} and param=='var_value': annotation,converter='ValueArgument','valueArg'
        typed.append(f'{camel(param)}: {annotation}')
        values.append(f'{converter}({camel(param)})')
    args=', '.join([repr(token),*values])
    methods.append(f'  /** Mirrors Rust `TextForgeBuilderMethods::{name}` through `{token}`. */\n  {camel(name)}({", ".join(typed)}): Pipeline {{ return this.add({args}); }}\n')
    mapping.append({'rust':name,'javascript':camel(name),'mnemonic':token,'parameters':list(zip(parameters,kinds))})
if len(mapping)<70: raise ValueError('Unexpected builder shape')
output=ROOT/'ts/index.ts'
current=output.read_text();begin='  // BEGIN GENERATED BUILDER METHODS\n';end='  // END GENERATED BUILDER METHODS\n'
prefix,rest=current.split(begin);_,suffix=rest.split(end)
files={output:prefix+begin+''.join(methods)+end+suffix, ROOT/'docs/builder-parity.json':json.dumps({'coreVersion':'0.2.0','apiSha256':hashlib.sha256(api.encode()).hexdigest(),'registrySha256':hashlib.sha256(registry.encode()).hexdigest(),'methods':mapping},indent=2)+'\n'}
for path,content in files.items():
    if '--check' in sys.argv:
        if path.read_text()!=content: raise SystemExit(f'Stale generated file: {path}')
    else: path.write_text(content)
