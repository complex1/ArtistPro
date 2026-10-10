"""Copy distribution license files for the pinned backend packages and interpreter."""
import importlib.metadata as metadata
import json
from pathlib import Path
import re
import shutil
import sys

root = Path(__file__).resolve().parent.parent
out = root / 'docs' / 'licenses' / 'python'
records = []
for line in (root / 'requirements.txt').read_text().splitlines():
    match = re.match(r'([\w-]+)(?:\[[^]]+\])?==', line)
    if not match:
        continue
    name = match[1]
    try:
        dist = metadata.distribution(name)
    except metadata.PackageNotFoundError:
        # Conditional packages such as uvloop are absent on some platforms.
        records.append({'name': name, 'status': 'not installed on this build platform'})
        continue
    notices = []
    for file in dist.files or []:
        parts = [str(p).lower() for p in file.parts]
        if any('license' in p or 'licence' in p for p in parts) or re.match(r'^(notice|copying|copyright)(\.|$)', parts[-1]):
            source = Path(dist.locate_file(file))
            if not source.is_file():
                continue
            destination = out / f'{name}@{dist.version}' / Path(*file.parts[1:])
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            notices.append(str(destination.relative_to(root)))
    records.append({'name': name, 'version': dist.version, 'license': dist.metadata.get('License-Expression') or dist.metadata.get('License'), 'notices': notices})
base = Path(sys.base_prefix).resolve()
interpreter_license = next((p / filename for p in [base, *base.parents[:5]] for filename in ['LICENSE', 'LICENSE.txt'] if (p / filename).is_file()), None)
if interpreter_license:
    destination = out / 'Python-LICENSE.txt'
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(interpreter_license, destination)
records.append({'name': 'Python', 'version': sys.version.split()[0], 'noticeCopied': bool(interpreter_license)})
(root / 'docs' / 'python-licenses.json').write_text(json.dumps(records, indent=2) + '\n')
print(f'Preserved notices for {len(records)} Python runtime components')
