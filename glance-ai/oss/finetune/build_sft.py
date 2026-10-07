# Build chat-format SFT data for the Glance judge LoRA (matches eval/prompt.py SYSTEM + render + SCHEMA exactly).
# Sources: (1) v2 train/val split, product-correct rule-corrected reference labels, UNSURE rows excluded;
#          (2) OSS eval rows with hand-corrected gold, NON-CORE only (CORE162 stays a clean held-out eval).
# Targets: {"decision","family","action","title","due"}; due = ENGINE date (runtime never trusts an LLM date);
#          title = deterministic verb+object extraction (EN imperative / HE infinitive), checked by eval/score.py title_ok;
#          show rows whose title cannot be built cleanly are DROPPED (never train on a bad title), counted in the manifest.
# Prompt modes: 'zero' (SYSTEM + email; default, shorter) or 'fewshot' (identical to the OSS eval prompt).
import json, re, random, sys, os, collections, argparse
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'eval'))
from paths import ROOT as AI
from prompt import SYSTEM, FEWSHOT, SCHEMA, render
ap = argparse.ArgumentParser(); ap.add_argument('--silence-ratio', type=float, default=1.5); ap.add_argument('--prompt', default='zero', choices=['zero', 'fewshot'])
ap.add_argument('--seed', type=int, default=13); ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), 'data'))
a = ap.parse_args(); random.seed(a.seed)
D = os.environ.get('GLANCE_V2_DATASET') or os.path.join(AI, 'model', 'dataset', 'out-v2')
HE = re.compile(r'[\u0590-\u05FF]')
# --- title_ok copied verbatim from eval/score.py (score.py loads eval.jsonl at import time) ---
GREET = re.compile(r'^(hi|hello|hey|dear|re:|fw:|שלום|היי|הי)\b|sali|סאלי', re.I)
DATEW = re.compile(r'\b(by|until|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|october|oct)\b|\d{1,2}[:/.]\d{2}|(?:^|\s)עד(?:\s|$)|יום\s|ראשון|שלישי|רביעי|חמישי|מחר', re.I)
PRON = re.compile(r"^(i|we|i'll|we'll|i will|let's|quick|thanks|sorry|can|could|please)\b", re.I)
def title_ok(t, lang):
    t = (t or '').strip()
    if not t or len(t) > 60 or GREET.search(t) or DATEW.search(t) or (bool(HE.search(t)) != (lang == 'he')): return False
    if lang == 'he': return t.split(' ')[0].startswith('ל') or t.split(' ')[0] in ('שיחה', 'פגישה')
    return not PRON.search(t) and len(t.split()) >= 2
NAMES = r'(?:Sali|Dana|Maya|Lior|Noa|Avi|Omer|Rachel|Tom|Sarah|Michael|Ethan|David|Yael|Ben|Roni|Alex|Shiran|Hila|Yossi|Billing|סאלי|דנה|מאיה|ליאור|נועה|אבי|עומר|שירן|הילה|יוסי|שרה|מיכאל)'
CUT_EN = re.compile(r"\s+(?:by|before|on|until|till|no later than|asap|today|tonight|tomorrow|next|this|end of|eod|at|first thing|when|if|so|and get back|and let me know|for me|from you|to me|to us)\b.*$|[?.!,;:].*$", re.I)
CUT_HE = re.compile(r"\s+(?:עד|לפני|ביום|מחר|היום|השבוע|בשבוע|ב-?\d|ASAP|asap|אם|כי|ו?לחזור אליי|אליי|אלינו|לי)(?=$|[\s,.?!]).*$|[?.!,;:].*$")
def clean_obj(o, lang):
    o = (CUT_EN if lang == 'en' else CUT_HE).sub('', o.strip()).strip()
    o = re.sub(r'\b(?:please|kindly)\b', '', o, flags=re.I).strip()
    o = re.sub(r'\s+' + NAMES + r'\b', '', o).strip()
    return re.sub(r'\s{2,}', ' ', o)
EN_PAT = [
    (r"\b(?:can|could|would|will) you (?:please |kindly |also |quickly )?(?:be able to )?(?P<v>[a-z]+)(?: and (?P<v2>[a-z]+))? (?P<o>[^\n?.!]+)", None),
    (r"\b(?:please|pls|kindly) (?P<v>[a-z]+)(?: and (?P<v2>[a-z]+))? (?P<o>[^\n?.!]+)", None),
    (r"\bI(?:'ll| will| am going to|'m going to) (?P<v>send|share|forward|deliver|get|have|email|upload|prepare|finish|review|sign|return) (?:you |over )?(?P<o>[^\n?.!]+)", None),
    (r"\b(?:you|You) (?:agreed|promised|said you would|will) (?:to )?(?P<v>[a-z]+) (?P<o>[^\n?.!]+)", None),
    (r"\bI need (?P<o>the [^\n?.!]+?) from you", 'send'),
    (r"\bif you could (?:please )?(?P<v>[a-z]+)(?: and (?P<v2>[a-z]+))? (?P<o>[^\n?.!]+)", None),
    (r"\b(?:you|You)(?:'d| would|'ll| mentioned you'd| mentioned you would| mentionde you'd) (?P<v>[a-z]+) (?P<o>[^\n?.!]+)", None),
    (r"\b(?:we|We) agreed to (?P<v>[a-z]+) (?P<o>[^\n?.!]+)", None),
    (r"\bfrom you: (?P<v>[a-z]+) (?P<o>[^\n?.!]+)", None),
    (r"\b(?:please |Please )?(?P<v>proceed) (?P<o>with [^\n?.!]+)", None),
    (r"\bCan I get (?P<o>the [^\n?.!]+?) from you", 'send'),
]
VERB_OK = set('attach resend loop proceed handle renew aprove send share forward review approve confirm sign countersign return pay transfer wire settle clear process upload prepare fill update check double-check scan submit file save complete finish deliver email provide book schedule set arrange look go read draft write send over get let reply respond answer'.split())
HE_INF = {'תשלח': 'לשלוח', 'תשלחי': 'לשלוח', 'תשלחו': 'לשלוח', 'שלח': 'לשלוח', 'שלחי': 'לשלוח', 'אשלח': 'לשלוח', 'נשלח': 'לשלוח', 'תעביר': 'להעביר', 'תעבירי': 'להעביר', 'תעבירו': 'להעביר', 'אעביר': 'להעביר',
          'תבדוק': 'לבדוק', 'תבדקי': 'לבדוק', 'תרשום': 'לרשום', 'תרשמי': 'לרשום', 'תחתום': 'לחתום', 'תחתמי': 'לחתום', 'תאשר': 'לאשר', 'תאשרי': 'לאשר', 'תעלה': 'להעלות', 'תעלי': 'להעלות', 'תמלא': 'למלא', 'תמלאי': 'למלא',
          'תכין': 'להכין', 'תכיני': 'להכין', 'תחזיר': 'להחזיר', 'תחזירי': 'להחזיר', 'תשמור': 'לשמור', 'תשמרי': 'לשמור', 'שמור': 'לשמור', 'שמרי': 'לשמור', 'תשלם': 'לשלם', 'תשלמי': 'לשלם', 'תעבור': 'לעבור', 'תעברי': 'לעבור',
          'תסדיר': 'להסדיר', 'תסדירי': 'להסדיר', 'תסגור': 'לסגור', 'תסגרי': 'לסגור', 'תעדכן': 'לעדכן', 'תעדכני': 'לעדכן', 'תאשרו': 'לאשר', 'תמלאו': 'למלא', 'תכינו': 'להכין', 'תחתמו': 'לחתום', 'אחזיר': 'להחזיר', 'אכין': 'להכין', 'אעדכן': 'לעדכן', 'תבדקו': 'לבדוק', 'תסרקו': 'לסרוק', 'תסרוק': 'לסרוק', 'תסרקי': 'לסרוק', 'ותשלחו': 'לשלוח', 'נעביר': 'להעביר', 'תעקוב': 'לעקוב', 'תעקבי': 'לעקוב', 'תשלמו': 'לשלם', 'תעלו': 'להעלות', 'תחזירו': 'להחזיר', 'תעברו': 'לעבור', 'אחתום': 'לחתום', 'אבדוק': 'לבדוק', 'אשמור': 'לשמור'}
AMT = re.compile(r"(?:[$€£₪]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:usd|eur|ils|nis|dollars?|euros?|shekels?|₪|ש\"ח|ש״ח))(?:\s+|(?=[.,?!]))", re.I)
def strip_amt(t): return re.sub(r'\s{2,}', ' ', AMT.sub('', t))
def title_en(own, step, surface):
    t = strip_amt(own.replace('\n', ' '))
    if step == 'file_save':
        m = re.search(r"\b(?:save|upload|store|file|put) (?:the |this )?(?:attached |enclosed )?(?P<o>[a-z0-9 \-']{2,40}?)(?: file| doc(?:ument)?)? (?:to|in|into|on) (?:my |your |our |the )?(?P<t>google drive|drive|onedrive|one drive)", t, re.I)
        o = (m.group('o').strip() if m else 'attachment'); o = re.sub(r'^(?:attached|attachment)$', 'attachment', o)
        tgt = ('OneDrive' if 'one' in m.group('t').lower() else 'Drive') if m else ('OneDrive' if surface == 'outlook' else 'Drive')
        return f"Save the {o} to {tgt}"
    if step == 'calendar':
        m = re.search(r"\b(call|meeting|meet|sync|catch-?up|kickoff|demo|interview|review|session|chat)\b[^.?!\n]{0,60}?\b(?:about|on|for|to go over|to discuss|regarding|re)\b (?P<o>[^\n?.!,]+)", t, re.I)
        noun = (m.group(1).lower() if m else (re.search(r"\b(call|meeting|sync|kickoff|demo|interview|session)\b", t, re.I) or [None, 'meeting'])[1].lower())
        noun = {'meet': 'meeting', 'chat': 'call', 'catchup': 'catch-up'}.get(noun, noun)
        if m:
            o = clean_obj(m.group('o'), 'en')
            if o and len(o) < 45: return f"{noun.capitalize()} about {o}"
        v = title_en(own, 'draft', surface)
        if v and not re.match(r'(?i)(set|schedule|book|arrange|confirm)\b', v): return v
        return noun.capitalize()
    if step == 'task' and re.search(r'\bapproved?\b|go ahead|budget|confirming the (?:amount|fee|price)|agreed\s*[—-]|it is, at|amount is', t, re.I) and not re.search(r"\bI(?:'ll| will)\b|you (?:agreed|promised|will)|proceed with", t):
        m = re.search(r"\bfor (?P<o>(?:the )?[a-z][a-z \-]{2,40}?)(?:[.!,]|$| this| today)", t, re.I)
        o = clean_obj(m.group('o'), 'en') if m else ''
        return f"Record the confirmed amount for {o}" if o and len(o.split()) <= 5 else "Record the confirmed amount"
    for pat, fixed in EN_PAT:
        m = re.search(pat, t, re.I)
        if not m: continue
        v = (fixed or m.group('v')).lower()
        if v not in VERB_OK: continue
        v2 = m.groupdict().get('v2'); o = clean_obj(m.group('o'), 'en')
        o = re.sub(r"^(?:me|us|over|back)\s+", '', o)
        if not o or len(o.split()) > 7: continue
        if v in ('get', 'let'): continue
        if v == 'go' and o.startswith('over'): v, o = 'go', o
        return (v.capitalize() + (' and ' + v2.lower() if v2 and v2.lower() in VERB_OK else '') + ' ' + o).strip()
    return None
def title_he(own, step, surface):
    t = strip_amt(own.replace('\n', ' '))
    t = re.sub(r"(?:רציתי|אני רוצה|רצינו)\s+לבקש\s+(?:ממך\s+)?", '', t)
    if step == 'file_save':
        m = re.search(r"(?:לשמור|תשמור|תשמרי|שמור|שמרי|להעלות|תעלה|תעלי) את (?P<o>[^\s,.]+(?: [^\s,.]+)?) (?:ה)?(?:מצורף|מצורפת|המצורף|המצורפת)?", t)
        tgt = 'בוואן דרייב' if re.search(r'וואן\s?-?דרייב|one\s?-?drive', t, re.I) else ('בדרייב' if re.search(r'דרייב|drive', t, re.I) else ('בוואן דרייב' if surface == 'outlook' else 'בדרייב'))
        o = m.group('o') if m else 'הקובץ'
        o = re.sub(r'\s*(?:המצורף|המצורפת|מצורף|מצורפת)$', '', o)
        return f"לשמור את {o} {tgt}"
    if step == 'calendar':
        m = re.search(r"(שיחה|פגישה|סנכרון|דמו|ראיון|קיקאוף)[^.?!\n]{0,40}?\s(?:על|בנושא|לגבי)\s(?P<o>[^\n?.!,]+)", t)
        if m:
            o = clean_obj(m.group('o'), 'he')
            if o: return f"{'שיחה' if m.group(1) in ('שיחה',) else 'פגישה'} על {o}"
        m = re.search(r"לעבור על (?P<o>[^\n?.!,]+)", t)
        if m and clean_obj(m.group('o'), 'he'): return f"פגישה על {clean_obj(m.group('o'), 'he')}"
        v = title_he(own, 'draft', surface)
        if v and not re.match(r'(לתאם|לקבוע)', v): return v
        if re.search(r'שיחה|call|נדבר|אתקשר|להתקשר', t, re.I): return 'שיחה'
        if re.search(r'פגישה|ניפגש|meeting|לתאם|דמו|ראיון', t, re.I): return 'פגישה'
        return None
    if step == 'task' and re.search(r'אושר|מאושר|אישרנו|תקציב|לך על זה|תתקדם|מאשר|מאשרת|סגרנו עם|סגרנו על|הסכום הוא', t) and not re.search(r'אשלח|אעביר|נעביר|התחייבת', t):
        m = re.search(r"עבור (?P<o>(?:ה)?[\u05d0-\u05ea][\u05d0-\u05ea \-]{1,30}?)(?:[.!,;]|$)", t)
        o = m.group('o').strip() if m else ''
        return f"לתעד את הסכום שסוכם עבור {o}" if o and len(o.split()) <= 4 else "לתעד את הסכום שסוכם"
    m = re.search(r"(?:^|\s)(?P<v>ל[\u05d0-\u05ea]{2,})\s(?P<o>[^\n?.!]+)", t)
    cands = []
    for w, inf in HE_INF.items():
        mm = re.search(r"(?:^|\s)" + w + r"(?:\s+בבקשה)?\s(?P<o>[^\n?.!]+)", t)
        if mm: cands.append((mm.start(), inf, mm.group('o')))
    if m and m.group('v') not in ('לי', 'לך', 'לכם', 'לנו', 'לפני', 'לגבי', 'לקוח', 'למערכת', 'לספק'): cands.append((m.start(), m.group('v'), m.group('o')))
    if not cands: return None
    _, v, o = sorted(cands)[0]
    o = clean_obj(o, 'he'); o = re.sub(r'^(?:לי|לך|אליי|בבקשה)\s+', '', o)
    if not o or len(o.split()) > 7: return None
    return f"{v} {o}"
def make_title(own, step, lang, surface):
    try: t = title_he(own, step, surface) if lang == 'he' else title_en(own, step, surface)
    except Exception: t = None
    if not t: return None
    t = re.sub(r'\s{2,}', ' ', t).strip()
    if step in ('task', 'draft'): return t if title_ok(t, lang) else None
    return t if (len(t) <= 60 and not GREET.search(t) and not DATEW.search(t) and (bool(HE.search(t)) == (lang == 'he'))) else None
STEP2 = {'draft': ('reply', 'draft_reply'), 'task': ('task', 'create_task'), 'calendar': ('calendar', 'calendar_event'), 'file_save': ('file', None)}
def target(step, surface, own, title, due):
    if step == 'SILENT': return {"decision": "silence", "family": "none", "action": "none", "title": "", "due": ""}
    fam, act = STEP2[step]
    if step == 'file_save':
        named_od = re.search(r'one\s?-?drive|וואן\s?-?דרייב', own, re.I); named_d = re.search(r'\bdrive\b|דרייב', re.sub(r'one\s?-?drive|וואן\s?-?דרייב', '', own, flags=re.I), re.I)
        act = 'save_to_onedrive' if named_od else ('save_to_drive' if named_d else ('save_to_onedrive' if surface == 'outlook' else 'save_to_drive'))
    return {"decision": "act", "family": fam, "action": act, "title": title, "due": due or ""}
def messages(case, tgt):
    m = [{"role": "system", "content": SYSTEM}]
    if a.prompt == 'fewshot':
        for u, x in FEWSHOT: m += [{"role": "user", "content": u}, {"role": "assistant", "content": x}]
    m += [{"role": "user", "content": render(case)}, {"role": "assistant", "content": json.dumps(tgt, ensure_ascii=False, separators=(',', ':'))}]
    return m
facts = {json.loads(l)['id']: json.loads(l) for l in open(os.path.join(a.out, 'engine-facts.jsonl'))}
stats = collections.Counter(); outs = {'train': [], 'val': []}
for split in ('train', 'val'):
    rows = [json.loads(l) for l in open(f'{D}/{split}.jsonl')]
    rows = [r for r in rows if not r['reference'].get('unsure')]
    show = [r for r in rows if r['reference']['label'] != 'SILENT']; sil = [r for r in rows if r['reference']['label'] == 'SILENT']
    keep_sil = [r for r in sil if [x for x in r['reference'].get('ruleCorrected', []) if x != 'typo-invariant']]
    rest = [r for r in sil if r not in keep_sil]; random.shuffle(rest)
    by = collections.defaultdict(list)
    for r in rest: by[r.get('scenario') or r['provenance']].append(r)
    budget = max(0, int(a.silence_ratio * len(show)) - len(keep_sil)); keys = sorted(by); i = 0
    while budget > 0 and any(by.values()):
        k = keys[i % len(keys)]; i += 1
        if by[k]: keep_sil.append(by[k].pop()); budget -= 1
    for r in show + keep_sil:
        f = facts.get(r['id']);
        if not f: stats['no-facts'] += 1; continue
        step = r['reference']['label'].split('|')[1] if r['reference']['label'] != 'SILENT' else 'SILENT'
        title = ''
        if step != 'SILENT':
            title = make_title(f['own'], step, r['lang'], r.get('surface'))
            if not title: stats[f'drop-no-title:{r["lang"]}:{step}'] += 1; continue
        due = f['engDate'] if (step != 'SILENT' and f['engDate'] and f['engDate'] >= '2026-10-07') else ''
        case = {'direction': r.get('direction', 'inbound'), 'from': (r.get('from') or {}).get('email'), 'subject': r.get('subject', ''),
                'attachments': [f'attachment{i + 1}.pdf' for i in range(r.get('attachmentCount') or 0)], 'body': f['body']}
        tgt = target(step, r.get('surface'), f['own'], title, due)
        outs[split].append({'messages': messages(case, tgt), 'meta': {'id': r['id'], 'src': 'v2-' + split, 'lang': r['lang'], 'label': r['reference']['label'], 'rules': r['reference'].get('ruleCorrected', [])}})
        stats[f'{split}:{r["lang"]}:{step}'] += 1
# OSS eval, non-core rows only, hand-corrected gold
ev = [json.loads(l) for l in open(os.path.join(os.path.dirname(__file__), '..', 'eval', 'eval.jsonl'))]
CORE = set(open(os.path.join(os.path.dirname(__file__), '..', 'eval', 'core_subset.txt')).read().strip().split(','))
FAM2STEP = {'task': 'task', 'calendar': 'calendar', 'reply': 'draft', 'file': 'file_save'}
for r in ev:
    if r['id'] in CORE: continue
    g = r['gold']; step = FAM2STEP.get(g.get('family')) if g['decision'] == 'act' else 'SILENT'
    title = ''
    if step != 'SILENT':
        gt = (g.get('title') or '').strip()
        title = gt if (r.get('goldSource') != 'teacher' and make_title(gt, step, r['lang'], r.get('surface')) is None and title_ok(gt, r['lang'])) else make_title(r['body'], step, r['lang'], r.get('surface'))
        if not title: stats[f'drop-no-title:oss:{r["lang"]}:{step}'] += 1; continue
    tgt = target(step, r.get('surface'), r['body'], title, g.get('due') or '')
    outs['train'].append({'messages': messages(r, tgt), 'meta': {'id': 'oss-' + r['id'], 'src': 'oss-eval-noncore', 'lang': r['lang'], 'label': step}})
    stats[f'oss:{r["lang"]}:{step}'] += 1
random.shuffle(outs['train'])
for k, v in outs.items():
    with open(os.path.join(a.out, f'sft_{k}.jsonl'), 'w') as fh:
        for x in v: fh.write(json.dumps(x, ensure_ascii=False) + '\n')
man = {'prompt': a.prompt, 'silence_ratio': a.silence_ratio, 'n_train': len(outs['train']), 'n_val': len(outs['val']), 'counts': dict(sorted(stats.items()))}
json.dump(man, open(os.path.join(a.out, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
print(json.dumps(man, indent=1, ensure_ascii=False))
