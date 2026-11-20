"""kinds-v0 generator. usage: python3 gen.py probe | full   (writes raw-<stage>.jsonl, appends cost-ledger.jsonl)
For each kind: POS rows (a free-wording paraphrase of exactly that kind) and NEG rows (hard negatives for that kind: close to the shape, but NOT a close for the reader)."""
import sys, os, json, re, random, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import llm
from spec import KINDS, NEG_HINTS, GEN_SYSTEM
HERE = os.path.dirname(os.path.abspath(__file__))
def prompt(kind, pol, n, seed):
    want, desc = KINDS[kind]
    mix = f"About half English and half Hebrew; about 60% mail-shaped and 40% chat-shaped. Variation seed {seed}: make this batch different from any other batch."
    if pol == 'pos':
        return f"Write {n} DIFFERENT messages that each clearly ask for, or announce, exactly this kind of close for Sali:\nKIND: {kind} = {desc}\n{mix}\nEvery message must carry what that close needs (names, dates, times, amounts) in its own free wording."
    return f"Write {n} DIFFERENT HARD NEGATIVES for this kind: messages that LOOK close to it (same vocabulary, same topic, same shape) but where Sali should NOT get a '{kind}' close.\nKIND: {kind} = {desc}\nVary the reason between: {NEG_HINTS[kind]}.\n{mix}\nThe message must not be a clear close of ANY of these kinds either (meeting hold, reply needed, task, payment, file creation, row, appended text): it should be a case where a careful assistant stays silent."
def parse(txt):
    m = re.search(r'\[.*\]', txt, re.S)
    if not m: return []
    try: arr = json.loads(m.group(0))
    except Exception: return []
    return [a for a in arr if isinstance(a, dict) and isinstance(a.get('text'), str) and a['text'].strip() and a.get('lang') in ('en', 'he')]
def one(job):
    kind, pol, n, seed, tag = job
    try: txt, stop, usd = llm.call(tag, GEN_SYSTEM, prompt(kind, pol, n, seed), max_tokens=3500)
    except SystemExit: raise
    except Exception as e: return job, [], 0.0, 'ERR ' + type(e).__name__
    rows = parse(txt)
    return job, rows, usd, stop if rows else 'PARSEFAIL'
def run(stage, jobs, out):
    n_rows = 0; bad = 0
    with cf.ThreadPoolExecutor(6) as ex, open(out, 'a') as fo:
        for job, rows, usd, note in ex.map(one, jobs):
            kind, pol, n, seed, tag = job
            if not rows: bad += 1; print('  job failed', kind, pol, note, flush=True)
            for i, r in enumerate(rows):
                n_rows += 1
                fo.write(json.dumps({'id': f'kv0-{stage}-{kind}-{pol}-{seed}-{i}', 'intended': kind if pol == 'pos' else 'none', 'forKind': kind, 'pol': pol, 'lang': r['lang'], 'shape': r.get('shape', 'mail'), 'subject': r.get('subject', '') or '', 'text': r['text'].strip(), 'provenance': 'synthetic-kinds-v0', 'ownerVerified': False, 'genModel': 'claude-haiku-5-5'}, ensure_ascii=False) + '\n')
    return n_rows, bad
if __name__ == '__main__':
    stage = sys.argv[1]; random.seed(7)
    if stage == 'probe':   # 200 rows: 10 messages x 20 jobs spread over 10 kinds x pos/neg
        ks = ['cal_hold', 'cal_move', 'task', 'pay', 'doc_create', 'sheet_row', 'doc_append', 'video_link', 'commit_reader', 'file_save']
        jobs = [(k, p, 10, 9000 + i, f'probe-{k}-{p}') for i, k in enumerate(ks) for p in ('pos', 'neg')]
    elif stage == 'topup':  # kinds the teacher kept fewer than ~55 positives for, plus the two failed jobs
        jobs = [(k, 'pos', 10, 500 + s, f'topup-{k}-pos') for k, ns in (('commit_sender', 6), ('commit_reader', 3), ('excel_create', 2), ('task', 2), ('cal_booking', 1), ('draft_reply', 2), ('cal_hold', 2), ('notice_system', 2)) for s in range(ns)]
    else:                  # ~60 pos + ~60 neg per kind, 10 per call
        jobs = [(k, p, 10, s, f'full-{k}-{p}') for k in KINDS for p in ('pos', 'neg') for s in range(7)]
    out = os.path.join(HERE, f'raw-{stage}.jsonl')
    if os.path.exists(out) and stage == 'probe': os.remove(out)
    n, bad = run(stage, jobs, out)
    print('rows', n, 'failed jobs', bad, 'spent USD', round(llm.spent(), 4))
