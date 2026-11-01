"""Create and optionally extract a portable source archive without build artifacts."""
from pathlib import Path
import sys
import tarfile
ROOT=Path(__file__).resolve().parents[1]
exclude={'.git','target','node_modules','dist','native','source-dist','__pycache__'}
with tarfile.open(sys.argv[1],'w:gz') as archive:
    for path in sorted(ROOT.rglob('*')):
        relative=path.relative_to(ROOT)
        if any(part in exclude for part in relative.parts) or path.name=='native.node' or path.suffix=='.tgz': continue
        if path.is_file(): archive.add(path,arcname=str(relative))
if len(sys.argv)>2:
    destination=Path(sys.argv[2]);destination.mkdir(parents=True)
    with tarfile.open(sys.argv[1]) as archive:
        archive.extractall(destination,filter='data')
