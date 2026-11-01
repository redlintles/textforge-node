"""Run the required pre-commit matrix and binding checks. No commits or publishing."""
import subprocess
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
checks=[
 ['cargo','fmt','--check'],
 ['cargo','clippy','--all-targets','--','-D','warnings'],
 ['cargo','clippy','--all-targets','--features','test_access','--','-D','warnings'],
 *[['cargo','test',*(['--features',feature] if feature else [])] for feature in ['', 'bytecode','watchers','test_access']],
 [sys.executable,'scripts/check-core.py'],
 [sys.executable,'scripts/generate-builder.py','--check'],
 [sys.executable,'scripts/generate-reference.py','--check'],
 [sys.executable,'scripts/generate-processor-reference.py','--check'],
 [sys.executable,'scripts/check-parity.py'],
 ['npm','run','typecheck'],['npm','test'],
]
for command in checks:
 print('Running '+' '.join(command),flush=True)
 subprocess.run(command,cwd=ROOT,check=True,shell=sys.platform=='win32' and command[0]=='npm')
