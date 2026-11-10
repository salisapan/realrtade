#!/usr/bin/env python3
"""Check that the running interpreter matches model/requirements-train.lock.txt (exact versions) and CPython 3.13.
train-v2.py calls check() before training and refuses on a mismatch, unless GLANCE_ALLOW_UNPINNED_ENV=1 (experiments only; the report
then records pinned:false). Run directly to print the env:  .venv/bin/python train/pinned_env.py"""
import os, sys, json
from importlib import metadata
LOCK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'requirements-train.lock.txt')
PY = (3, 13)
def locked():
    out = {}
    for l in open(LOCK):
        l = l.split('#')[0].strip()
        if l: n, v = l.split('=='); out[n.strip().lower()] = v.strip()
    return out
def check(strict=True):
    want = locked(); got = {}; bad = []
    for n, v in want.items():
        try: got[n] = metadata.version(n)
        except metadata.PackageNotFoundError: got[n] = None
        if got[n] != v: bad.append(f'{n}: want {v}, got {got[n]}')
    if sys.version_info[:2] != PY: bad.append(f'python: want {PY[0]}.{PY[1]}.x, got {sys.version.split()[0]}')
    env = {'python': sys.version.split()[0], 'packages': got, 'pinned': not bad, 'lock': 'model/requirements-train.lock.txt'}
    if bad and strict and os.environ.get('GLANCE_ALLOW_UNPINNED_ENV') != '1':
        raise SystemExit('training env does not match requirements-train.lock.txt:\n  ' + '\n  '.join(bad) + '\nset GLANCE_ALLOW_UNPINNED_ENV=1 only for an experiment')
    return env
if __name__ == '__main__':
    e = check(strict=False); print(json.dumps(e, indent=1)); sys.exit(0 if e['pinned'] else 1)
