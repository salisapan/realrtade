# Assembles the teacher-authored sets. Run: python3 scripts/intent/teacher/build.py
# Writes scripts/intent/teacher-train.json and flow-trial-extension/test/fixtures/intent-teacher-eval.json.
# Removes any sentence that duplicates (or nearly duplicates) a hand-written dev/blind sentence, so the
# older evaluation sets stay clean, and any eval sentence that duplicates a training sentence.
import json, os, re, importlib.util, sys
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(os.path.join(here, '..', '..', '..'))
def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), os.path.join(here, name + '.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
def rows(m, lang, src):
    return [{'t': t, 'act': a, 'action': ac, 'lang': lang, 'src': src} for a, ac, ss in m.D for t in ss]
EXTRA_TRAIN = ['en-train-3', 'en-train-4', 'he-train-2']
def toks(t): return set(re.findall(r'[\w֐-׿]+', t.lower()))
def norm(t): return ' '.join(re.findall(r'[\w֐-׿]+', t.lower()))
def close(a, b):
    if norm(a) == norm(b): return True
    ta, tb = toks(a), toks(b)
    return len(ta & tb) / max(1, len(ta | tb)) >= 0.7 and min(len(ta), len(tb)) >= 5
train = rows(load('en-train'), 'en', 'teacher') + rows(load('en-train-2'), 'en', 'teacher') + rows(load('he-train'), 'he', 'teacher')
ev = rows(load('en-eval'), 'en', 'teacher-eval') + rows(load('he-eval'), 'he', 'teacher-eval')
ev2 = rows(load('en-eval-2'), 'en', 'teacher-eval-2') + rows(load('he-eval-2'), 'he', 'teacher-eval-2')
fx = os.path.join(root, 'flow-trial-extension', 'test', 'fixtures')
old = [r['t'] for f in ('intent-gold.json', 'intent-blind.json') for r in json.load(open(os.path.join(fx, f), encoding='utf-8'))]
for n in EXTRA_TRAIN:
    if os.path.exists(os.path.join(here, n + '.py')): train += rows(load(n), 'en' if n.startswith('en') else 'he', 'teacher')
kept, dropped = [], []
for r in train:
    (dropped if any(close(r['t'], o) for o in old) else kept).append(r)
ev_kept = [r for r in ev if not any(close(r['t'], o) for o in old) and not any(close(r['t'], k['t']) for k in kept)]
json.dump(kept, open(os.path.join(root, 'scripts', 'intent', 'teacher-train.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
ev2_kept = [r for r in ev2 if not any(close(r['t'], o) for o in old) and not any(close(r['t'], k['t']) for k in kept) and not any(close(r['t'], e['t']) for e in ev_kept)]
json.dump(ev2_kept, open(os.path.join(fx, 'intent-teacher-eval-2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
json.dump(ev_kept, open(os.path.join(fx, 'intent-teacher-eval.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('train', len(kept), 'dropped as near-copies of the dev/blind sets:', len(dropped))
for d in dropped: print('  -', d['t'])
print('eval', len(ev_kept), 'of', len(ev), '| eval-2', len(ev2_kept), 'of', len(ev2))
