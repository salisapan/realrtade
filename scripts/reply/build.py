import json, random, itertools, sys
sys.path.insert(0, '.')
from data import TRAIN, EVAL, TRAIN2, EVAL2
random.seed(7)
NOUNS = {"en": ["contract", "invoice", "report", "proposal", "quote", "agreement", "document", "payment", "budget", "schedule", "form", "order", "presentation", "draft"],
         "he": ["חוזה", "חשבונית", "דוח", "הצעה", "הצעת מחיר", "הסכם", "מסמך", "תשלום", "תקציב", "לוח זמנים", "טופס", "הזמנה", "מצגת", "טיוטה"]}
DAYS = {"en": ["Monday", "Tuesday", "Thursday", "Friday", "next week", "tomorrow", "the 12th", "Sunday"],
        "he": ["ביום שני", "ביום שלישי", "ביום חמישי", "ביום שישי", "בשבוע הבא", "מחר", "ב-12", "ביום ראשון"]}
GREET = {"en": ["", "", "Hi, ", "Hi Dana, ", "Hello, ", "Hey, "], "he": ["", "", "היי, ", "היי דנה, ", "שלום, ", "אהלן, "]}
SIGN = {"en": ["", "", "", " Thanks", " Best, Alex", " Regards"], "he": ["", "", "", " תודה", " בברכה, אלכס", " ממני"]}
out = []
for cls, langs in TRAIN.items():
    for lang, bank in langs.items():
        for t in bank:
            slots = ("{N}" in t) + ("{D}" in t)
            reps = 3 if slots else 1   # a few fillings per template; templates without slots get greeting/signature variants instead
            seen = set()
            for _ in range(reps * 4):
                s = t.replace("{N}", random.choice(NOUNS[lang])).replace("{D}", random.choice(DAYS[lang]))
                g, sg = random.choice(GREET[lang]), random.choice(SIGN[lang])
                if lang == "en" and g and s[:1].isupper() and g.endswith(", "): s2 = g + s[0].lower() + s[1:] if not s.startswith("I ") else g + s
                else: s2 = g + s
                s2 = (s2 + sg).strip()
                if s2 not in seen:
                    seen.add(s2); out.append({"t": s2, "c": cls, "lang": lang})
                if len(seen) >= (reps + 2): break
# TRAIN2 is used as written (short, plain forms), plus a copy with a greeting.
for cls, langs in TRAIN2.items():
    for lang, bank in langs.items():
        for t in bank:
            out.append({"t": t, "c": cls, "lang": lang})
            g = random.choice(GREET[lang][2:])
            out.append({"t": g + t, "c": cls, "lang": lang})
json.dump(out, open('replies-train.json', 'w'), ensure_ascii=False, indent=0)
ev = [{"t": t, "c": cls, "lang": lang} for cls, langs in EVAL.items() for lang, bank in langs.items() for t in bank]
json.dump(ev, open('replies-eval.json', 'w'), ensure_ascii=False, indent=0)
ev2 = [{"t": t, "c": cls, "lang": lang} for cls, langs in EVAL2.items() for lang, bank in langs.items() for t in bank]
json.dump(ev2, open('replies-eval2.json', 'w'), ensure_ascii=False, indent=0)
print('eval2', len(ev2))
from collections import Counter
print('train', len(out), Counter(r['c'] for r in out)); print('eval', len(ev), Counter(r['c'] for r in ev))
