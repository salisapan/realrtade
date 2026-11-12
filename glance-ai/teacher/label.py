#!/usr/bin/env python3
"""Label cases with a teacher model under labeling/pass-rules.md. Teacher only: labels and evaluates, never goes into the product.
usage: label.py --cases cases.jsonl --out labels.jsonl --model claude-haiku-5-5 [--limit 200] [--per-request 8] [--workers 4] [--tag probe] [--dry-run]
cases.jsonl rows: {id, lang, surface, direction, from, subject, body, attachments}; text is masked here (emails to <email>) before it leaves the machine.
Resumes: ids already in --out are skipped. Metered through api.py (ledger.jsonl, budget hard stop). Prints a cost summary."""
import json, os, re, sys, argparse, threading
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import api
ap = argparse.ArgumentParser(); ap.add_argument('--cases', required=True); ap.add_argument('--out', required=True); ap.add_argument('--model', required=True)
ap.add_argument('--limit', type=int, default=0); ap.add_argument('--per-request', type=int, default=8); ap.add_argument('--workers', type=int, default=4); ap.add_argument('--tag', default='label')
ap.add_argument('--dry-run', action='store_true')
A = ap.parse_args()
HERE = os.path.dirname(os.path.abspath(__file__))
RULES = open(os.path.join(HERE, '..', 'labeling', 'pass-rules.md'), encoding='utf8').read()
SYSTEM = RULES.split('\nOutput format:')[0].strip() + '\n\nAnswer with JSON Lines only, one object per case and nothing else: {"item": <the ITEM number>, "step": "<SILENT|draft|task|calendar|file_save|CONTEXT|UNSURE>", "undatedAsk": <true|false>}'
EMAIL = re.compile(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+')
mask = lambda t: EMAIL.sub('<email>', str(t or ''))
STEPS = {'SILENT', 'draft', 'task', 'calendar', 'file_save', 'CONTEXT', 'UNSURE'}
def block(n, r):
    frm = r.get('from'); frm = frm.get('name') if isinstance(frm, dict) else str(frm or '').split('@')[0]
    return '### ITEM %d [%s, %s, %s, attachments=%s]\nFrom: %s\nSubject: %s\n\n%s\n\n' % (n, r.get('lang', ''), r.get('surface', ''), r.get('direction', ''), r.get('attachments', 0), mask(frm), mask(r.get('subject')), mask(r.get('body')))
rows = [json.loads(l) for l in open(A.cases, encoding='utf8') if l.strip()]
done = set(json.loads(l)['id'] for l in open(A.out, encoding='utf8')) if os.path.exists(A.out) else set()
todo = [r for r in rows if r['id'] not in done]
if A.limit: todo = todo[:A.limit]
print('cases %d, already labelled %d, to label %d, model %s, per request %d' % (len(rows), len(done), len(todo), A.model, A.per_request), flush=True)
chunks = [todo[i:i + A.per_request] for i in range(0, len(todo), A.per_request)]
lock = threading.Lock(); stats = {'usd': 0.0, 'n': 0, 'bad': 0, 'stopped': None}
def work(ch):
    if stats['stopped']: return
    user = ''.join(block(i + 1, r) for i, r in enumerate(ch))
    try:
        if A.dry_run: text, usd = '\n'.join(json.dumps({'item': i + 1, 'step': 'SILENT', 'undatedAsk': False}) for i in range(len(ch))), 0.0
        else: text, usd = api.call(A.model, SYSTEM, user, max_tokens=60 * len(ch) + 40 + (0 if 'haiku' in A.model else 2500), tag=A.tag, est_in=900 + 450 * len(ch), est_out=40 * len(ch))
    except api.Refused as e:
        with lock: stats['stopped'] = str(e)
        return
    got = {}
    for l in text.splitlines():
        l = l.strip().strip('`')
        if not l.startswith('{'): continue
        try: o = json.loads(l)
        except Exception: continue
        if o.get('step') in STEPS and isinstance(o.get('item'), int) and 1 <= o['item'] <= len(ch): got[o['item']] = o
    if len(got) < len(ch):
        with lock, open(A.out + '.unparsed.txt', 'a', encoding='utf8') as f: f.write('=== chunk ids %s\n%s\n' % ([r['id'] for r in ch], text))
    with lock:
        with open(A.out, 'a', encoding='utf8') as f:
            for i, r in enumerate(ch):
                o = got.get(i + 1)
                if not o: stats['bad'] += 1; continue
                f.write(json.dumps({'id': r['id'], 'step': o['step'], 'undatedAsk': bool(o.get('undatedAsk')), 'model': A.model}) + '\n'); stats['n'] += 1
        stats['usd'] += usd
        if (stats['n'] // 100) != ((stats['n'] - len(ch)) // 100): print('  labelled %d, spent $%.4f' % (stats['n'], stats['usd']), flush=True)
with ThreadPoolExecutor(max_workers=A.workers) as ex: list(ex.map(work, chunks))
print(json.dumps({'labelled': stats['n'], 'unparsed': stats['bad'], 'usd': round(stats['usd'], 4), 'usd_per_1000_rows': round(1000 * stats['usd'] / max(1, stats['n']), 4), 'ledger_total_usd': round(api.spent(), 4), 'stopped': stats['stopped']}))
if stats['stopped']: sys.exit(3)
