import json, re, sys, glob, statistics, os
rows = {r['id']: r for r in (json.loads(l) for l in open('eval.jsonl'))}
HE = re.compile(r'[\u0590-\u05FF]')
NEG = re.compile(r"(?i:\b(?:don'?t|do not|no need|not necessary|never mind)\b)|\bNOT\b|(?:^|\s)(?:אל\s+ת\S+|אין צורך|לא צריך)")
UNSUB = re.compile(r'unsubscribe|להסרה|הסרה מרשימת', re.I)
OPENERS = {'hi','hello','hey','dear','sali','thanks','sorry','great','perfect','quick','fyi','great,','please','שלום','היי','הי','סאלי','תודה','מצטער','לידיעתך','עדכון'}
def addressed_other(body):
    m = re.match(r'\s*([A-Z][a-z]+|[\u05d0-\u05ea]+),', body)
    return bool(m) and m.group(1).lower() not in OPENERS
def veto_teacher(c):
    t = c['teacher']; r = str(t.get('reason') or '')
    return t['decision'] == 'silence' and (r.startswith('quiet:') or r.startswith('host:') or r in ('file', 'third-party', 'fact-reply-block'))
def veto_pack(c):
    return c.get('direction') == 'outbound' or bool(NEG.search(c['body'])) or addressed_other(c['body']) or bool(UNSUB.search(c['body']))
GREET = re.compile(r'^(hi|hello|hey|dear|re:|fw:|שלום|היי|הי)\b|sali|סאלי', re.I)
DATEW = re.compile(r'\b(by|until|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|october|oct)\b|\d{1,2}[:/.]\d{2}|(?:^|\s)עד(?:\s|$)|יום\s|ראשון|שלישי|רביעי|חמישי|מחר', re.I)
PRON = re.compile(r"^(i|we|i'll|we'll|i will|let's|quick|thanks|sorry|can|could|please)\b", re.I)
def title_ok(title, lang, sender=None):
    t = (title or '').strip()
    checks = {'nonempty': bool(t), 'len<=60': len(t) <= 60, 'no_greeting_or_name': not GREET.search(t),
              'no_date': not DATEW.search(t), 'source_lang': (bool(HE.search(t)) == (lang == 'he')) if t else False}
    if lang == 'he': checks['verb_first'] = t.split(' ')[0].startswith('ל') if t else False
    else: checks['verb_first'] = bool(t) and not PRON.search(t) and len(t.split()) >= 2
    if sender: checks['no_greeting_or_name'] = checks['no_greeting_or_name'] and sender.lower() not in t.lower()
    return all(checks.values()), checks
def norm_model(p):
    if not isinstance(p, dict): return {'decision': 'silence', 'invalid': True}
    return p
def norm_teacher(t, c):
    if t['decision'] != 'act': return {'decision': 'silence'}
    act = {'task': 'create_task', 'calendar': 'calendar_event', 'reply': 'draft_reply'}.get(t.get('family'))
    if t.get('family') == 'file': act = 'save_to_onedrive' if (c.get('surface') == 'outlook') else 'save_to_drive'
    return {'decision': 'act', 'family': t.get('family'), 'action': act, 'title': t.get('title') or '', 'due': t.get('due') or ''}
def gold_action(c):
    g = c['gold']
    if g['decision'] != 'act': return 'none'
    if g['family'] == 'file': return 'save_to_onedrive' if re.search(r'onedrive', c['body'], re.I) else 'save_to_drive'
    return {'task': 'create_task', 'calendar': 'calendar_event', 'reply': 'draft_reply'}[g['family']]
def score(preds, name, subset=None, recs=None):
    ids = [i for i in preds if (subset is None or subset(rows[i]))]
    gs = [i for i in ids if rows[i]['gold']['decision'] == 'silence']; ga = [i for i in ids if rows[i]['gold']['decision'] == 'act']
    wrong = [i for i in gs if preds[i]['decision'] == 'act']; miss = [i for i in ga if preds[i]['decision'] != 'act']
    both = [i for i in ga if preds[i]['decision'] == 'act']
    fam = [i for i in both if preds[i].get('family') == rows[i]['gold']['family']]
    actn = [i for i in both if preds[i].get('action') == gold_action(rows[i])]
    e2e = [i for i in ids if (preds[i]['decision'] == rows[i]['gold']['decision']) and (preds[i]['decision'] == 'silence' or preds[i].get('family') == rows[i]['gold']['family'])]
    tq = [i for i in both if rows[i]['gold']['family'] == 'task']
    tq_ok = [i for i in tq if title_ok(preds[i].get('title'), rows[i]['lang'], rows[i].get('fromName'))[0]]
    dd = [i for i in both if rows[i]['gold'].get('due')]
    dd_ok = [i for i in dd if (preds[i].get('due') or '') == rows[i]['gold']['due']]
    pct = lambda a, b: (round(100 * len(a) / len(b), 1) if b else None)
    out = {'variant': name, 'n': len(ids), 'wrongDoIt%': pct(wrong, gs), 'wrongDoIt_n': f'{len(wrong)}/{len(gs)}', 'missed%': pct(miss, ga), 'missed_n': f'{len(miss)}/{len(ga)}',
           'family_acc%': pct(fam, both), 'action_acc%': pct(actn, both), 'end2end%': pct(e2e, ids), 'title_ok%': pct(tq_ok, tq), 'title_n': f'{len(tq_ok)}/{len(tq)}', 'due_acc%': pct(dd_ok, dd),
           'wrong_ids': wrong, 'miss_ids': miss}
    return out
def load_model(path):
    recs = {}
    for l in open(path):
        r = json.loads(l); recs[r['id']] = r
    return recs
def variants(recs, tag):
    model = {i: norm_model(r['pred']) for i, r in recs.items()}
    teacher = {i: norm_teacher(rows[i]['teacher'], rows[i]) for i in recs}
    sil = {'decision': 'silence'}
    v = {f'{tag}': model,
         f'{tag} + teacher-veto': {i: (sil if veto_teacher(rows[i]) else p) for i, p in model.items()},
         f'{tag} + teacher-veto + veto-pack': {i: (sil if (veto_teacher(rows[i]) or veto_pack(rows[i])) else p) for i, p in model.items()},
         f'{tag} AND teacher': {i: (p if teacher[i]['decision'] == 'act' else sil) for i, p in model.items()}}
    return v
if __name__ == '__main__':
    allrows = []
    teacher = {i: norm_teacher(rows[i]['teacher'], rows[i]) for i in rows}
    tv = {'teacher (0.9.34 rules)': teacher, 'teacher + veto-pack': {i: ({'decision': 'silence'} if veto_pack(rows[i]) else p) for i, p in teacher.items()}}
    CORE = set(open('core_subset.txt').read().split(','))
    groups = [('ALL', None), ('CORE162', lambda c: c['id'] in CORE), ('SetC-worker-adv', lambda c: c['set'] == 'C'), ('SetD-gold22-real', lambda c: c['set'] == 'D'), ('EN', lambda c: c['lang'] == 'en'), ('HE', lambda c: c['lang'] == 'he'), ('SetB-adversarial', lambda c: c['set'] == 'B')]
    for name, p in tv.items():
        for g, f in groups: allrows.append(dict(score(p, name, f), group=g))
    meta = {}
    for path in sorted(glob.glob('../results/pred-*-schema.jsonl')) + sorted(glob.glob('../results/pred-*-free.jsonl')):
        tag = os.path.basename(path)[5:-6]
        recs = load_model(path)
        if len(recs) < len(rows) and tag.endswith('-schema') and False: tag += f' (partial {len(recs)})'
        lat = [r['latency_s'] for r in recs.values()][1:]
        rss = [r['rss_mb'] for r in recs.values() if r.get('rss_mb')]
        meta[tag] = {'json_valid%': round(100 * sum(r['json_valid'] for r in recs.values()) / len(recs), 1), 'json_strict%': round(100 * sum(r['json_strict'] for r in recs.values()) / len(recs), 1),
                     'lat_p50_s': round(statistics.median(lat), 2) if lat else None, 'lat_p95_s': round(sorted(lat)[int(0.95 * (len(lat) - 1))], 2) if lat else None, 'rss_max_mb': max(rss) if rss else None}
        # teacher fidelity on set A (agreement with teacher's decision)
        A = [i for i in recs if rows[i]['set'] == 'A']
        meta[tag]['teacher_agree_A%'] = round(100 * sum((norm_model(recs[i]['pred'])['decision'] == rows[i]['teacher']['decision']) for i in A) / max(1, len(A)), 1)
        for name, p in variants(recs, tag).items():
            for g, f in groups: allrows.append(dict(score(p, name, f), group=g))
    json.dump({'rows': allrows, 'meta': meta}, open('../results/scores.json', 'w'), ensure_ascii=False, indent=1)
    cols = ['group', 'variant', 'n', 'wrongDoIt%', 'wrongDoIt_n', 'missed%', 'family_acc%', 'action_acc%', 'end2end%', 'title_ok%', 'title_n', 'due_acc%']
    print('| ' + ' | '.join(cols) + ' |'); print('|' + '---|' * len(cols))
    for g in [x[0] for x in groups]:
        for r in allrows:
            if r['group'] == g: print('| ' + ' | '.join(str(r[c]) for c in cols) + ' |')
    print(); print(json.dumps(meta, indent=1))
