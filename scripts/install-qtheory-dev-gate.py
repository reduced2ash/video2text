#!/usr/bin/env python3
"""Apply only the Qtheory Dev integration to an existing, customized apps gate.

Back up the live file first. Dry-run by default; --write applies atomically.
"""
import argparse
import os
from pathlib import Path
import tempfile

IMPORT = "import { qtheoryDevCard, registerQtheoryDevAccess } from './qtheory-dev-gate.js';\n"

def patched(source):
    changes = [
        ('          <div class="grid">', '          <div class="grid">\n            ${qtheoryDevCard}'),
        ('export function registerProtectedApps(app, rootDir) {', 'export function registerProtectedApps(app, rootDir) {\n  registerQtheoryDevAccess(app, { isAuthorized });'),
    ]
    if IMPORT not in source:
        source = IMPORT + source
    for old, new in changes:
        if new in source:
            continue
        if source.count(old) != 1:
            raise ValueError('Unexpected app-gate structure; no write performed.')
        source = source.replace(old, new, 1)
    return source

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', type=Path)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    original = args.path.read_text()
    result = patched(original)
    if result == original:
        print('Qtheory Dev gate integration already present.')
    elif args.write:
        fd, temporary = tempfile.mkstemp(dir=args.path.parent, prefix='.qtheory-dev-')
        try:
            with os.fdopen(fd, 'w') as output:
                output.write(result)
            os.chmod(temporary, args.path.stat().st_mode & 0o777)
            os.replace(temporary, args.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        print('Added Qtheory Dev import, hub card and authorization endpoint.')
    else:
        print('Ready: only the Qtheory Dev import, hub card and endpoint will be added.')
