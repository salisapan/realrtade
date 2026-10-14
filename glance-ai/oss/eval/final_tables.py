# Builds markdown tables for REPORT.md from scores + encoder probabilities.
import json, subprocess, numpy as np
subprocess.run(['python3', 'score.py'], capture_output=True)
from score import rows, veto_pack, veto_teacher
d = json.load(open('../results/scores.json')); meta = d['meta']
def row(g, v): return next((r for r in d['rows'] if r['group'] == g and r['variant'] == v), None)
models = [k for k in meta if k.endswith('-schema')]
def name(m): return m.replace('-schema', '')
out = []
out.append('### Table 1 — CORE162 (same 162 cases for every model: all of Sets B/C/D + every 3rd Set-A case)\n')
out.append('| Judge | wrong-Do-It ↓ | missed-close ↓ | family acc (when both act) | action acc | end-to-end acc | task-title OK | due exact | JSON valid (schema / free) | p50 / p95 latency | peak RSS |')
out.append('|---|---|---|---|---|---|---|---|---|---|---|')
def line(label, r, m=None):
    j = '—'; lat = '—'; rss = '—'
    if m:
        mm = meta[m]; fm = meta.get(m.replace('-schema', '-free'))
        j = f"{mm['json_valid%']}% / {fm['json_valid%'] if fm else 'n/a'}%"; lat = f"{mm['lat_p50_s']}s / {mm['lat_p95_s']}s"; rss = f"{mm['rss_max_mb']} MB"
    return f"| {label} | {r['wrongDoIt%']}% ({r['wrongDoIt_n']}) | {r['missed%']}% ({r['missed_n']}) | {r['family_acc%']}% | {r['action_acc%']}% | {r['end2end%']}% | {r['title_ok%']}% ({r['title_n']}) | {r['due_acc%']}% | {j} | {lat} | {rss} |"
for t in ['teacher (0.9.34 rules)', 'teacher + veto-pack']: out.append(line(t, row('CORE162', t)))
for m in models: out.append(line(name(m) + ' (alone)', row('CORE162', m), m))
out.append('\n### Table 2 — model alone vs model + hard veto (CORE162)\n')
out.append('| Model | variant | wrong-Do-It | missed-close | end-to-end |'); out.append('|---|---|---|---|---|')
for m in models:
    for suf, lab in [('', 'alone'), (' + teacher-veto', '+ teacher-veto (teacher explicit silence reasons)'), (' + teacher-veto + veto-pack', '+ teacher-veto + veto-pack'), (' AND teacher', 'AND teacher (act only if teacher acts)')]:
        r = row('CORE162', m + suf); out.append(f"| {name(m)} | {lab} | {r['wrongDoIt%']}% ({r['wrongDoIt_n']}) | {r['missed%']}% ({r['missed_n']}) | {r['end2end%']}% |")
out.append('\n### Table 3 — English vs Hebrew (all cases each model ran; full 275 for 0.8B/2B, 162 for others)\n')
out.append('| Judge | EN wrong-Do-It | EN missed | HE wrong-Do-It | HE missed | HE task-title OK |'); out.append('|---|---|---|---|---|---|')
for v in ['teacher (0.9.34 rules)', 'teacher + veto-pack'] + models + [m + ' + teacher-veto + veto-pack' for m in models]:
    e, h = row('EN', v), row('HE', v)
    out.append(f"| {name(v)} (n={e['n']}+{h['n']}) | {e['wrongDoIt%']}% ({e['wrongDoIt_n']}) | {e['missed%']}% ({e['missed_n']}) | {h['wrongDoIt%']}% ({h['wrongDoIt_n']}) | {h['missed%']}% ({h['missed_n']}) | {h['title_ok%']}% ({h['title_n']}) |")
out.append('\n### Table 4 — full 275-case set (only models that ran all cases)\n')
out.append('| Judge | wrong-Do-It | missed-close | family acc | end-to-end | teacher agreement on Set A |'); out.append('|---|---|---|---|---|---|')
for v in ['teacher (0.9.34 rules)', 'teacher + veto-pack'] + [m for m in models if meta[m].get('teacher_agree_A%') and row('ALL', m)['n'] == len(rows)]:
    r = row('ALL', v); ta = meta.get(v, {}).get('teacher_agree_A%', '—')
    out.append(f"| {name(v)} | {r['wrongDoIt%']}% ({r['wrongDoIt_n']}) | {r['missed%']}% ({r['missed_n']}) | {r['family_acc%']}% | {r['end2end%']}% | {ta}{'%' if ta != '—' else ''} |")
for m in [m for m in models if row('ALL', m)['n'] == len(rows)]:
    r = row('ALL', m + ' + teacher-veto + veto-pack'); out.append(f"| {name(m)} + teacher-veto + veto-pack | {r['wrongDoIt%']}% ({r['wrongDoIt_n']}) | {r['missed%']}% ({r['missed_n']}) | {r['family_acc%']}% | {r['end2end%']}% | — |")
# encoder gate table from saved probs (re-scored with the current veto pack)
out.append('\n### Table 5 — small encoder as a silence/act gate (all 275 eval cases, hand-checked gold)\n')
out.append('| Gate | threshold | wrong-Do-It | missed-close | + veto: wrong-Do-It | + veto: missed | latency/case (CPU, bs=1) |'); out.append('|---|---|---|---|---|---|---|')
ids = list(rows); y = np.array([rows[i]['gold']['decision'] == 'act' for i in ids]); vm = np.array([veto_pack(rows[i]) or veto_teacher(rows[i]) for i in ids])
for f, lab, j, ths in [('encoder-e5-small-probs.json', 'e5-small frozen + logistic regression', 'encoder-e5-small.json', [0.5, 0.76]), ('encoder-e5-ft-probs.json', 'e5-small fine-tuned (top 6 layers)', 'encoder-e5-small-finetuned.json', [0.5, 0.8, 0.9])]:
    P = json.load(open('../results/' + f)); p = np.array([P[i] for i in ids]); ms = json.load(open('../results/' + j))['per_case_ms_bs1']
    for t in ths:
        pr = p >= t; pv = pr & ~vm
        fmt = lambda pr: (f"{100*(pr & ~y).sum()/(~y).sum():.1f}% ({(pr & ~y).sum()}/{(~y).sum()})", f"{100*(~pr & y).sum()/y.sum():.1f}% ({(~pr & y).sum()}/{y.sum()})")
        a, b = fmt(pr); c, e = fmt(pv); out.append(f"| {lab} | {t} | {a} | {b} | {c} | {e} | {ms} ms |")
open('../results/tables.md', 'w').write('\n'.join(out) + '\n'); print('\n'.join(out)); print(json.dumps(meta, indent=0))
out2 = ['\n### Table 6 — task-title quality over every case each judge ran (gold = task, judge acted)\n', '| Judge | all | EN | HE |', '|---|---|---|---|']
for v in ['teacher (0.9.34 rules)'] + models:
    a, e, h = row('ALL', v), row('EN', v), row('HE', v)
    out2.append(f"| {name(v)} | {a['title_ok%']}% ({a['title_n']}) | {e['title_ok%']}% ({e['title_n']}) | {h['title_ok%']}% ({h['title_n']}) |")
# sample titles on the hand-gold promise cases
out2 += ['\n### Table 7 — what each judge said on the hand-checked spec cases\n']
spec = ['B-neg-01', 'B-neg-05', 'B-save-01', 'B-save-03', 'B-fyi-01', 'B-past-05', 'B-out-02', 'B-prom-01', 'B-prom-02', 'B-prom-03', 'B-3p-01', 'B-inj-01']
preds = {}
import glob, os
for p in sorted(glob.glob('../results/pred-*-schema.jsonl')):
    t = os.path.basename(p)[5:-12]; preds[t] = {json.loads(l)['id']: json.loads(l)['pred'] for l in open(p)}
hdr = ['case', 'gold', 'teacher'] + list(preds)
out2 += ['| ' + ' | '.join(hdr) + ' |', '|' + '---|' * len(hdr)]
def short(p):
    if not p: return '—'
    if p.get('decision') != 'act': return 'silence'
    return f"{p.get('action')}: {p.get('title','')}"[:48]
for i in spec:
    c = rows[i]; g = c['gold']; t = c['teacher']
    gs = 'silence' if g['decision'] != 'act' else f"{g['family']}" + (f": {g['title']}" if g.get('title') else '')
    ts = 'silence' if t['decision'] != 'act' else f"{t.get('action')}: {t.get('title') or ''}"[:48]
    out2.append(f"| {i} `{c['body'][:45].replace(chr(10),' ').replace('|','/')}` | {gs} | {ts} | " + ' | '.join(short(preds[m].get(i)) if i in preds[m] else 'n/r' for m in preds) + ' |')
open('../results/tables.md', 'a').write('\n'.join(out2) + '\n'); print('\n'.join(out2))
