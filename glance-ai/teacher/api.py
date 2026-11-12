#!/usr/bin/env python3
"""Minimal Anthropic Messages client for the Glance model lab's TEACHER role (labels and evaluates; never goes into the product).
Rules (owner, 2026-11-11):
  - the key is read ONLY from GLANCE_LAB_ANTHROPIC_API_KEY; ANTHROPIC_API_KEY is never read, set or exported (that name would bill ordinary Claude Code usage);
  - the key is never printed, logged, put in argv, committed or written anywhere (the curl-free transport below sends it only in a request header);
  - every call is metered in ledger.jsonl (model, tokens, USD, no text); a call that would take the ledger over the budget is refused (default hard stop $24 of about $35
    prepaid credit; the workspace also has a $30 monthly limit; override only DOWN with GLANCE_LAB_BUDGET_USD);
  - stdlib only (urllib honours HTTPS_PROXY; the CA bundle is read from SSL_CERT_FILE / REQUESTS_CA_BUNDLE / the sandbox bundle when present).
"""
import json, os, ssl, sys, time, threading, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
LEDGER = os.path.join(HERE, 'ledger.jsonl')
PRICES = json.load(open(os.path.join(HERE, 'prices.json')))
BUDGET = min(24.0, float(os.environ.get('GLANCE_LAB_BUDGET_USD', '24')))
URL = 'https://api.anthropic.com/v1/messages'
# SPEND GATE (owner, 2026-11-12): only the cheap probe may spend without the owner's explicit yes. Everything else (the sealed-set frontier baseline, the 10k labelling, the
# escalation) needs the file teacher/owner-yes.json, written by the session ONLY after the owner has said yes IN THAT SESSION; its "scope" lists the tags it allows
# (sealed, small, escalate). The probe is capped at $1.50 in total and only on the small model.
GATE_FILE = os.path.join(HERE, 'owner-yes.json')
PROBE_CAP = 1.50
def _gate(model, tag):
    if tag == 'ping': return
    if tag == 'probe':
        if model != 'claude-haiku-5-5': raise Refused('the probe must use claude-haiku-5-5')
        probe = sum(json.loads(l)['usd'] for l in open(LEDGER) if l.strip() and json.loads(l).get('tag') == 'probe') if os.path.exists(LEDGER) else 0.0
        if probe >= PROBE_CAP: raise Refused('the probe is capped at $%.2f (spent %.4f)' % (PROBE_CAP, probe))
        return
    try: g = json.load(open(GATE_FILE))
    except Exception: g = {}
    if tag not in (g.get('scope') or []): raise Refused("SPEND GATE: tag '%s' needs the owner's explicit yes in this session (teacher/owner-yes.json with that scope); report the probe cost and stop" % tag)
_lock = threading.Lock()
class Refused(Exception): pass

def _key():
    k = os.environ.get('GLANCE_LAB_ANTHROPIC_API_KEY')
    if not k: raise Refused('GLANCE_LAB_ANTHROPIC_API_KEY is not set in this session (the key lives in the glance-model-lab environment); nothing was called')
    return k

def spent():
    if not os.path.exists(LEDGER): return 0.0
    return sum(json.loads(l)['usd'] for l in open(LEDGER) if l.strip())

def cost(model, u):
    p = PRICES[model]; i = u.get('input_tokens', 0); o = u.get('output_tokens', 0)
    cw = u.get('cache_creation_input_tokens', 0); cr = u.get('cache_read_input_tokens', 0)
    return (i * p['in'] + o * p['out'] + cw * p['in'] * 1.25 + cr * p['in'] * 0.10) / 1e6

def _ctx():
    for v in ('SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE'):
        if os.environ.get(v) and os.path.exists(os.environ[v]): return ssl.create_default_context(cafile=os.environ[v])
    if os.path.exists('/root/.ccr/ca-bundle.crt'): return ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
    return ssl.create_default_context()

def call(model, system, user, max_tokens=600, tag='', est_in=0, est_out=0):
    """One Messages call. Returns (text, usd). Refuses before calling if the estimate would pass the budget."""
    if model not in PRICES: raise Refused('no price for ' + model + ' in prices.json')
    _gate(model, tag)
    key = _key()
    with _lock:
        est = cost(model, {'input_tokens': est_in, 'output_tokens': est_out or max_tokens})
        if spent() + est > BUDGET: raise Refused('budget: spent %.2f + estimate %.2f would pass the %.2f hard stop' % (spent(), est, BUDGET))
    body = json.dumps({'model': model, 'max_tokens': max_tokens, 'temperature': 0,
                       'system': [{'type': 'text', 'text': system, 'cache_control': {'type': 'ephemeral'}}], 'messages': [{'role': 'user', 'content': user}]}).encode()
    req = urllib.request.Request(URL, data=body, headers={'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': key})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120, context=_ctx()) as r: resp = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            code = e.code; msg = e.read()[:300].decode('utf8', 'replace')
            if code in (401, 403): raise Refused('auth failed (HTTP %d): stop and report; the key is not rotated from here' % code)
            if code in (429, 500, 502, 503, 529) and attempt < 3: time.sleep(2 ** attempt * 2); continue
            raise Refused('HTTP %d: %s' % (code, msg[:200].replace(key, '<key>')))
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 3: time.sleep(2 ** attempt * 2); continue
            raise Refused('network: ' + str(e)[:150])
    u = resp.get('usage', {}); usd = cost(model, u)
    with _lock:
        with open(LEDGER, 'a') as f: f.write(json.dumps({'t': time.strftime('%Y-%m-%dT%H:%M:%S'), 'model': model, 'tag': tag, 'in': u.get('input_tokens', 0), 'out': u.get('output_tokens', 0),
                                                         'cache_w': u.get('cache_creation_input_tokens', 0), 'cache_r': u.get('cache_read_input_tokens', 0), 'usd': round(usd, 6)}) + '\n')
    text = ''.join(b.get('text', '') for b in resp.get('content', []) if b.get('type') == 'text')
    return text, usd

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'spent': print('spent $%.4f of the $%.2f hard stop' % (spent(), BUDGET))
    elif len(sys.argv) > 1 and sys.argv[1] == 'ping':
        t, usd = call('claude-haiku-5-5', 'Reply with one word.', 'Say: ok', max_tokens=8, tag='ping'); print('ok' if t.strip() else 'empty', 'cost $%.6f' % usd)
    else: print('usage: api.py spent | ping')
