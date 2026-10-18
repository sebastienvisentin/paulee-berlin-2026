#!/usr/bin/env python3
"""Setzt Version und Dateiliste im Service Worker (public/sw.js).
Nach jeder Änderung an public/ ausführen:  python3 tools/stamp.py
Die Version ergibt sich aus dem Inhalt aller Dateien – ändert sich etwas,
laden alle Geräte beim nächsten Öffnen mit Empfang die neue Fassung."""
import hashlib, json, os, re

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public')
SKIP = {'sw.js', '_headers', '_redirects', 'index.html'}  # index.html = '/'
TEMPLATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sw.template.js')

files = []
for d, _, fs in os.walk(ROOT):
    for f in fs:
        rel = os.path.relpath(os.path.join(d, f), ROOT).replace(os.sep, '/')
        if rel not in SKIP and not f.startswith('.'):
            files.append(rel)
files.sort()
h = hashlib.sha256()
for rel in files:
    h.update(rel.encode())
    with open(os.path.join(ROOT, rel), 'rb') as fh:
        h.update(fh.read())
version = h.hexdigest()[:10]
assets = ['/'] + ['/' + f for f in files]
src = open(TEMPLATE, encoding='utf-8').read()
src = src.replace("'__VERSION__'", repr(version)).replace('__ASSETS__', json.dumps(assets, indent=2))
open(os.path.join(ROOT, 'sw.js'), 'w', encoding='utf-8').write(src)
print(f'sw.js: Version {version}, {len(assets)} Dateien')
