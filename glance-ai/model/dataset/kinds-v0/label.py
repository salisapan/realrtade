"""kinds-v0 teacher: labels each generated row BLIND (the generator's intended kind is not shown). usage: python3 label.py <stage>
Reads raw-<stage>.jsonl, writes labeled-<stage>.jsonl (adds teacher, teacherWhy)."""
import sys, os, json, re, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import llm
from spec import KINDS
HERE = os.path.dirname(os.path.abspath(__file__))
SYS = "You label incoming messages for a lab. The READER is a person called Sali. For each message decide which ONE close, if any, a careful assistant should offer Sali with one click. Stay silent (none) unless the message clearly asks for or announces one of the closes below FOR SALI: hedges, negations, FYI, someone else acting, the past, an already-finished item, a changed-bank payment demand, a mass-mail footer, and unclear asks are all none. A plain request to pay a stated amount (an invoice, a bill, a friend's share, paying by bank transfer, Bit, Venmo or to the account printed on the invoice) IS a pay close; only a demand that says the bank details/account have CHANGED or are NEW is none.\nKINDS:\n" + "\n".join(f"- {k}: {d}" for k, (_, d) in KINDS.items()) + "\n- none: no close should be offered.\nOutput ONLY a JSON array, one element per message in order: {\"i\":<number>,\"kind\":\"<kind or none>\"}. No prose."
def one(batch):
    msg = "\n\n".join(f"### MESSAGE {j} ({r['lang']}, {r['shape']})\n" + (f"Subject: {r['subject']}\n" if r['subject'] else '') + r['text'] for j, r in enumerate(batch))
    txt, stop, usd = llm.call('label', SYS, msg, max_tokens=1500)
    m = re.search(r'\[.*\]', txt, re.S)
    try: arr = json.loads(m.group(0)); out = {int(a['i']): a['kind'] for a in arr}
    except Exception: out = {}
    return batch, out
if __name__ == '__main__':
    stage = sys.argv[1]
    rows = [json.loads(l) for l in open(os.path.join(HERE, f'raw-{stage}.jsonl'))]
    batches = [rows[i:i + 10] for i in range(0, len(rows), 10)]
    ok = miss = 0
    with cf.ThreadPoolExecutor(6) as ex, open(os.path.join(HERE, f'labeled-{stage}.jsonl'), 'w') as fo:
        for batch, out in ex.map(one, batches):
            for j, r in enumerate(batch):
                t = out.get(j)
                if t is None or (t not in KINDS and t != 'none'): miss += 1; r['teacher'] = None
                else: r['teacher'] = t; ok += 1
                fo.write(json.dumps(r, ensure_ascii=False) + '\n')
    print('labeled', ok, 'unlabeled', miss, 'spent USD', round(llm.spent(), 4))
