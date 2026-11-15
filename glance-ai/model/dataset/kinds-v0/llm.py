"""Thin Anthropic call wrapper for the kinds-v0 lab run. Reads the lab key from the environment (never printed, never written),
logs every call's token usage to cost-ledger.jsonl and refuses to call once the running estimate reaches the stop line."""
import os, json, time, threading
import anthropic
HERE = os.path.dirname(os.path.abspath(__file__))
LEDGER = os.path.join(HERE, 'cost-ledger.jsonl')
PRICE = {'claude-haiku-5-5': (0.10, 0.50)}  # USD per 1M tokens (input, output), prompts up to 100K tokens
STOP_USD = 5.5
_lock = threading.Lock()
client = anthropic.Anthropic(api_key=os.environ['GLANCE_LAB_ANTHROPIC_API_KEY'], max_retries=3, timeout=120)
def spent():
    if not os.path.exists(LEDGER): return 0.0
    return sum(json.loads(l)['usd'] for l in open(LEDGER) if l.strip())
def call(tag, system, user, model='claude-haiku-5-5', max_tokens=4000):
    with _lock:
        if spent() >= STOP_USD: raise SystemExit('STOP: running cost estimate reached %.2f USD' % STOP_USD)
    r = client.messages.create(model=model, max_tokens=max_tokens, system=system, messages=[{'role': 'user', 'content': user}],
                               thinking={'type': 'disabled'}, output_config={'effort': 'low'})
    pi, po = PRICE[model]; u = r.usage
    usd = (u.input_tokens * pi + u.output_tokens * po) / 1e6
    with _lock:
        with open(LEDGER, 'a') as f: f.write(json.dumps({'tag': tag, 'model': model, 'in': u.input_tokens, 'out': u.output_tokens, 'usd': usd, 't': int(time.time())}) + '\n')
    return ''.join(b.text for b in r.content if b.type == 'text'), r.stop_reason, usd
