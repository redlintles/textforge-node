"""Verify bundled provenance and the exact approved patch without network access."""
from pathlib import Path
import hashlib
import json
import os
import difflib

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT/'docs/core-provenance.json').read_text())
core = ROOT/'vendor/textforge'
actual = {str(p.relative_to(core)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(core.rglob('*')) if p.is_file() and 'target' not in p.parts and p.name != 'Cargo.lock'}
assert actual == manifest['files'], 'Bundled core content changed; review provenance'
upstream = next((Path(os.environ.get('CARGO_HOME',Path.home()/'.cargo'))/'registry/src').glob('*/textforge-0.2.0'))
assert json.loads((upstream/'.cargo_vcs_info.json').read_text())['git']['sha1']==manifest['revision']
patch=[]
for relative in actual:
    if relative in {'Cargo.toml'}: continue
    old=(upstream/relative).read_bytes();new=(core/relative).read_bytes()
    if old!=new:
        assert relative == 'src/api/portable/instruction.rs',f'Unexpected core modification: {relative}'
        patch.extend(difflib.unified_diff(old.decode().splitlines(True),new.decode().splitlines(True),fromfile='a/'+relative,tofile='b/'+relative))
assert ''.join(patch)==(ROOT/'docs/core-0.2.0.patch').read_text(),'Approved patch changed'
print(f'Verified {len(actual)} bundled core files and upstream provenance')
