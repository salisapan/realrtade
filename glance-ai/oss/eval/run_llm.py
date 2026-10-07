import json, sys, time, urllib.request, argparse, os, subprocess
from prompt import messages, SCHEMA
ap = argparse.ArgumentParser()
ap.add_argument('--port', default='8091'); ap.add_argument('--tag', required=True)
ap.add_argument('--mode', default='schema', choices=['schema', 'free'])
ap.add_argument('--limit', type=int, default=0); ap.add_argument('--ids', default='')
ap.add_argument('--pid', type=int, default=0)
a = ap.parse_args()
rows = [json.loads(l) for l in open('eval.jsonl')]
if a.ids: rows = [r for r in rows if r['id'] in a.ids.split(',')]
if a.limit: rows = rows[:a.limit]
out_path = f'../results/pred-{a.tag}-{a.mode}.jsonl'
done = set()
if os.path.exists(out_path):
    done = {json.loads(l)['id'] for l in open(out_path)}
f = open(out_path, 'a')
def rss(pid):
    try:
        for l in open(f'/proc/{pid}/status'):
            if l.startswith('VmRSS'): return int(l.split()[1]) // 1024
    except Exception: return None
for i, c in enumerate(rows):
    if c['id'] in done: continue
    body = {"messages": messages(c), "temperature": 0, "max_tokens": 120, "cache_prompt": True,
            "chat_template_kwargs": {"enable_thinking": False}}
    if a.mode == 'schema':
        body["response_format"] = {"type": "json_schema", "json_schema": {"name": "glance", "schema": SCHEMA}}
    t0 = time.time()
    try:
        req = urllib.request.Request(f'http://127.0.0.1:{a.port}/v1/chat/completions', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        resp = json.load(urllib.request.urlopen(req, timeout=600))
        txt = resp['choices'][0]['message'].get('content') or ''
        timings = resp.get('timings', {})
    except Exception as e:
        txt = ''; timings = {'error': str(e)}
    dt = time.time() - t0
    try:
        s = txt.strip()
        if s.startswith('```'): s = s.strip('`').split('\n', 1)[1] if '\n' in s else s
        pred = json.loads(s[s.find('{'): s.rfind('}') + 1]) if '{' in s else None
        valid = isinstance(pred, dict) and all(k in pred for k in ['decision', 'family', 'action', 'title', 'due'])
        strict_valid = valid and s.strip().startswith('{')
    except Exception:
        pred, valid, strict_valid = None, False, False
    rec = {"id": c['id'], "raw": txt, "pred": pred, "json_valid": valid, "json_strict": strict_valid, "latency_s": round(dt, 2),
           "prompt_n": timings.get('prompt_n'), "cache_n": timings.get('cache_n'), "pred_n": timings.get('predicted_n'), "rss_mb": rss(a.pid) if a.pid else None}
    f.write(json.dumps(rec, ensure_ascii=False) + '\n'); f.flush()
    print(i, c['id'], round(dt, 1), 's', txt[:110].replace('\n', ' '), flush=True)
