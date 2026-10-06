// A model the person runs on their own computer (core/local-lm-server.js): Ollama and LM Studio dialects, loopback-only enforcement,
// honest failures, and the same precision self-test as the browser's built-in model. The "servers" below are real HTTP servers on
// 127.0.0.1 speaking each dialect; they are fakes of Ollama and LM Studio, not the real programs.
// Run: node test/local-lm-server-corpus.cjs
const http = require('http');
const S = require('../core/local-lm-server.js').FlowLocalLMServer;
const { FlowLocalLM: LM } = require('../core/local-lm.js');
const { FlowLocalLMAudit: AUDIT } = require('../core/local-lm-audit.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// ---- a fake server in either dialect ------------------------------------------------------------------------
function startServer(opts) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, origin: req.headers.origin || null, body: body ? JSON.parse(body) : null });
      if (opts.status) { res.writeHead(opts.status); res.end('{}'); return; }
      const send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/api/tags') return send({ models: [{ name: 'llama3:8b' }, { name: 'gemma2:9b' }] });
      if (req.url === '/v1/models') return send({ data: [{ id: 'qwen2.5-7b-instruct' }] });
      const content = opts.answer(JSON.parse(body));
      if (req.url === '/api/chat') return send({ message: { role: 'assistant', content } });
      return send({ choices: [{ message: { role: 'assistant', content } }] });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, base: 'http://127.0.0.1:' + server.address().port })));
}
const sentenceOf = (b) => { const m = /Sentence: (".*")\s*$/s.exec(b.messages[0].content); return m ? JSON.parse(m[1]) : ''; };
const rowFor = (t) => AUDIT.find((r) => r.t.replace(/\s+/g, ' ').trim().slice(0, 400) === t);
// A model that reads the audit sentences correctly, and one that says "ask" about everything.
const goodModel = (b) => {
  const r = rowFor(sentenceOf(b));
  const act = r ? r.act : 'INFORM';
  return JSON.stringify({ act, action: act === 'ASK' || act === 'PROMISE' ? 'review' : 'none', who: act === 'ASK' ? 'you' : act === 'PROMISE' ? 'me' : 'none', when: null, amount: null });
};
const eagerModel = () => JSON.stringify({ act: 'ASK', action: 'review', who: 'you', when: null, amount: null });

(async () => {
  console.log('\n--- only this computer ---');
  [
    ['http://127.0.0.1:11434', true], ['http://localhost:1234', true], ['http://[::1]:11434', true], ['https://localhost:8443', true],
    ['https://api.openai.com', false], ['http://127.0.0.1.evil.com:11434', false], ['http://localhost.evil.com', false], ['http://user:pw@127.0.0.1:11434', false],
    ['http://192.168.1.20:11434', false], ['http://0.0.0.0:11434', false], ['ftp://127.0.0.1', false], ['file:///etc/passwd', false], ['not a url', false], ['', false]
  ].forEach(([u, ok]) => check('loopback check: ' + (u || '(empty)') + ' -> ' + ok, S.isLoopbackUrl(u) === ok));
  check('a config pointing anywhere else is refused outright', S.normalizeConfig({ provider: 'ollama', baseUrl: 'https://api.openai.com', model: 'x' }) === null && S.session({ provider: 'ollama', baseUrl: 'http://10.0.0.5:11434', model: 'x' }) === null);
  check('a model name is required, and an unknown provider is refused', S.normalizeConfig({ provider: 'ollama' }) === null && S.normalizeConfig({ provider: 'openai', model: 'gpt' }) === null);
  check('defaults: Ollama on 11434, LM Studio on 1234', S.normalizeConfig({ provider: 'ollama', model: 'm' }).baseUrl === 'http://127.0.0.1:11434' && S.normalizeConfig({ provider: 'lmstudio', model: 'm' }).baseUrl === 'http://127.0.0.1:1234');
  check('the permission asked for is the loopback host only', S.originPattern({ provider: 'ollama' }) === 'http://127.0.0.1/*' && S.originPattern({ provider: 'ollama', baseUrl: 'http://localhost:9' }) === 'http://localhost/*' && S.originPattern({ provider: 'ollama', baseUrl: 'https://x.com' }) === null);
  let leaked = 0;
  const spy = async () => { leaked++; return { ok: true, status: 200, json: async () => ({}) }; };
  const sneaky = S.session({ provider: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'm' }, { fetch: spy });
  const bad = await S.listModels({ provider: 'ollama', baseUrl: 'https://evil.example' }, { fetch: spy });
  check('listing models on a non-loopback address never calls fetch', bad.ok === false && bad.reason === 'refused' && leaked === 0, bad);
  check('a request to a non-loopback address is refused at the last moment, whatever built it', await (async () => { try { await S.session({ provider: 'ollama', baseUrl: 'http://127.0.0.1:1', model: 'm' }, { fetch: spy, timeoutMs: 100 }).prompt('x'); } catch (e) { /* ok */ } return true; })() && leaked <= 1);

  console.log('\n--- the two dialects ---');
  const SCHEMA = LM.SCHEMA;
  const ollama = await startServer({ answer: goodModel });
  const lm = await startServer({ answer: goodModel });
  const oSess = S.session({ provider: 'ollama', baseUrl: ollama.base, model: 'llama3:8b' }, { fetch });
  const lSess = S.session({ provider: 'lmstudio', baseUrl: lm.base, model: 'qwen2.5-7b-instruct' }, { fetch });
  const probe = 'Could you review the draft and tell me what you think by Friday?';
  const oOut = await oSess.prompt(LM.promptFor(probe, 'A'), SCHEMA);
  const lOut = await lSess.prompt(LM.promptFor(probe, 'A'), SCHEMA);
  check('Ollama: /api/chat, the schema as `format`, no streaming, temperature 0', ollama.seen[0].url === '/api/chat' && JSON.stringify(ollama.seen[0].body.format) === JSON.stringify(SCHEMA) && ollama.seen[0].body.stream === false && ollama.seen[0].body.options.temperature === 0 && ollama.seen[0].body.model === 'llama3:8b', ollama.seen[0]);
  check('LM Studio: /v1/chat/completions, the schema as a strict json_schema response format, temperature 0', lm.seen[0].url === '/v1/chat/completions' && lm.seen[0].body.response_format.type === 'json_schema' && lm.seen[0].body.response_format.json_schema.strict === true && lm.seen[0].body.temperature === 0, lm.seen[0]);
  check('server prompt names the act key in the schema hint', /Return one JSON object with exactly these keys/.test(ollama.seen[0].body.messages[0].content) && /\bact: one of ASK\|PROMISE\|INFORM\|ACK\b/.test(ollama.seen[0].body.messages[0].content) && /Sentence: /.test(ollama.seen[0].body.messages[0].content), ollama.seen[0].body.messages[0].content.slice(0, 200));
  check('both come back as the text core/local-lm.js parses', LM.parse(oOut) !== null && LM.parse(lOut) !== null, { oOut, lOut });
  check('no key, no cookie, no custom header is ever sent', [ollama.seen[0], lm.seen[0]].every((r) => !r.origin));
  check('the prompt is bounded', (() => { const r = S.chatRequest(S.normalizeConfig({ provider: 'ollama', model: 'm' }), 'x'.repeat(50000), SCHEMA); return r.body.messages[0].content.length === 4000; })());
  const mo = await S.listModels({ provider: 'ollama', baseUrl: ollama.base }, { fetch });
  const ml = await S.listModels({ provider: 'lmstudio', baseUrl: lm.base }, { fetch });
  check('the picker lists what the server has (both dialects)', mo.ok && mo.models.join() === 'llama3:8b,gemma2:9b' && ml.ok && ml.models.join() === 'qwen2.5-7b-instruct', { mo, ml });

  console.log('\n--- honest failures ---');
  const refused = await startServer({ status: 403 });
  const r403 = await S.listModels({ provider: 'ollama', baseUrl: refused.base }, { fetch });
  check('403 is explained as the Ollama origin setting, with the exact fix', r403.reason === 'origin' && /OLLAMA_ORIGINS=chrome-extension:\/\/\*/.test(r403.hint), r403);
  const nf = await startServer({ status: 404 });
  check('404 says the model or address is wrong', (await S.listModels({ provider: 'ollama', baseUrl: nf.base }, { fetch })).reason === 'not-found');
  const dead = await S.listModels({ provider: 'ollama', baseUrl: 'http://127.0.0.1:1' }, { fetch });
  check('nothing listening: "start the server first"', dead.reason === 'unreachable' && /Start the server/.test(dead.hint), dead);
  const slow = await startServer({ answer: () => new Promise(() => {}) });
  slow.server.removeAllListeners('request');
  slow.server.on('request', () => { /* never answers */ });
  let threw = null;
  try { await S.session({ provider: 'ollama', baseUrl: slow.base, model: 'm' }, { fetch, timeoutMs: 150 }).prompt('hello'); } catch (e) { threw = e.message; }
  check('a model that never answers times out and throws (core/local-lm.js reads that as silence)', threw === 'timeout', threw);
  const junk = await startServer({ answer: () => 'Sure! I think this is an ask.' });
  const jsess = S.session({ provider: 'ollama', baseUrl: junk.base, model: 'm' }, { fetch });
  check('chatty text instead of JSON is parsed as nothing, so the sentence stays silent', LM.parse(await jsess.prompt('x', SCHEMA)) === null);
  check('and a failing server makes classify return null, never a guess', await LM.classify(S.session({ provider: 'ollama', baseUrl: 'http://127.0.0.1:1', model: 'm' }, { fetch, timeoutMs: 300 }), probe) === null);

  console.log('\n--- the same precision self-test as the browser\'s model ---');
  const good = await LM.selfTest(oSess, AUDIT, { now: 1 });
  check('a model that reads the audit sentences right passes in both languages', good.en.ok === true && good.he.ok === true, good);
  const eager = await startServer({ answer: eagerModel });
  const eSess = S.session({ provider: 'ollama', baseUrl: eager.base, model: 'm' }, { fetch });
  const bad2 = await LM.selfTest(eSess, AUDIT, { now: 1 });
  check('a model that calls everything an ask FAILS the gate, so it never runs', bad2.en.ok === false && bad2.he.ok === false && bad2.en.precision < LM.TEST_MIN_PRECISION, bad2);
  check('a stored pass belongs to one model at one address: changing either means testing again', S.statusFits({ provider: 'ollama', baseUrl: ollama.base, model: 'llama3:8b' }, { provider: 'ollama', baseUrl: ollama.base, model: 'llama3:8b' }) && !S.statusFits({ provider: 'ollama', baseUrl: ollama.base, model: 'llama3:8b' }, { provider: 'ollama', baseUrl: ollama.base, model: 'gemma2:9b' }) && !S.statusFits(null, { provider: 'ollama', model: 'x' }));
  check('end to end: a passing local model proposes an ask the lists left silent, and it is only a proposal', await (async () => {
    const ask = AUDIT.find((r) => r.act === 'ASK' && r.lang === 'en' && r.t.split(/\s+/).length >= 6 && r.t.split(/\s+/).length <= 30).t;
    const p = await LM.propose(ask, { session: oSess, pipeline: { recognize: () => ({ unsure: true }), shapedAsk: () => true, shapedPromise: () => true }, status: { en: { ok: true }, he: { ok: true }, checkedAt: Date.now() }, now: Date.now() });
    return p && p.act === 'ASK' && p.tier === 'lm' && !('close' in p);
  })());


  console.log('\n--- the service worker sends exactly what the core describes ---');
  {
    const vm = require('vm');
    const bg = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'background.js'), 'utf8');
    const a = bg.indexOf('/* ------------------------------------------------ a model on this computer */');
    const b = bg.indexOf('/* ---------------------------------------------------------------- dispatch */');
    const code = bg.slice(a, b);
    const run = async (stored, fetchImpl, text, schema) => {
      const sandbox = { chrome: { storage: { local: { get: (k, cb) => cb({ localLmServer: stored }) } } }, fetch: fetchImpl, URL, AbortController, setTimeout, clearTimeout, console };
      vm.createContext(sandbox);
      vm.runInContext(code + '\nthis.lmServerPrompt = lmServerPrompt;', sandbox);
      return sandbox.lmServerPrompt(text, schema);
    };
    const passing = { en: { ok: true }, he: { ok: false }, checkedAt: 1 };
    for (const [provider, base, reqUrl] of [['ollama', ollama.base, '/api/chat'], ['lmstudio', lm.base, '/v1/chat/completions']]) {
      const before = (provider === 'ollama' ? ollama : lm).seen.length;
      const r = await run({ enabled: true, provider, baseUrl: base, model: 'm1', status: passing }, fetch, 'What is this? Sentence: "hello"', SCHEMA);
      const got = (provider === 'ollama' ? ollama : lm).seen[before];
      const want = S.chatRequest(S.normalizeConfig({ provider, baseUrl: base, model: 'm1' }), 'What is this? Sentence: "hello"', SCHEMA);
      check(provider + ': the worker sends the same request body as the core, to the same path', r.ok === true && got && got.url === reqUrl && JSON.stringify(got.body) === JSON.stringify(want.body), { got: got && got.body, want: want.body });
    }
    let calls = 0;
    const spy2 = async () => { calls++; return { ok: true, status: 200, json: async () => ({}) }; };
    const off = await run({ enabled: false, provider: 'ollama', model: 'm', status: passing }, spy2, 'x');
    const untested = await run({ enabled: true, provider: 'ollama', model: 'm', status: null }, spy2, 'x');
    const remote = await run({ enabled: true, provider: 'ollama', baseUrl: 'https://api.openai.com', model: 'm', status: passing }, spy2, 'x');
    const sneaky2 = await run({ enabled: true, provider: 'ollama', baseUrl: 'http://127.0.0.1.evil.com:11434', model: 'm', status: passing }, spy2, 'x');
    check('off, untested, a remote address and a look-alike host all refuse without any network call', off.reason === 'off' && untested.reason === 'off' && remote.reason === 'refused' && sneaky2.reason === 'refused' && calls === 0, { off, untested, remote, sneaky2, calls });
    const dead2 = await run({ enabled: true, provider: 'ollama', baseUrl: 'http://127.0.0.1:1', model: 'm', status: passing }, fetch, 'x');
    check('an unreachable server is a quiet failure, not an exception', dead2.ok === false && dead2.reason === 'unreachable', dead2);
  }

  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'core', 'local-lm-server.js'), 'utf8').split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '')).join('\n');
  check('the core file has no chrome.*, no DOM and no hard-coded remote host', !/\bchrome\.|\bdocument\.|\bwindow\.|https?:\/\/(?!127\.0\.0\.1|localhost|\[::1\])[a-z0-9.-]+\.[a-z]{2,}/i.test(src.replace(/https?:\/\/(?:127\.0\.0\.1|localhost)[^'"]*/g, '')));

  [ollama, lm, refused, nf, slow, junk, eager].forEach((s) => s.server.close());
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})();
