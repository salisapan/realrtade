// The dual-tier router: device first, server only with consent and only masked, JSON only, never a crash.
// Run: node test/exec-router-corpus.cjs
const { FlowExecRouter: R } = require('../core/exec-router.js');
const { FlowJsonEnforce: J } = require('../core/json-enforce.js');
const { FlowMaskIds: M } = require('../core/mask-ids.js');
const { FlowPrivacyShield: Shield } = require('../core/privacyShield.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const PROMPT = 'Email from Dana Levi: "Please wire $3,850 for account 99887766 by 2026-10-09 and call +972-54-123-4567."';
const task = (title) => JSON.stringify({ action: 'create_task', title, dueText: null });

function rig(over) {
  const calls = { local: [], server: [] };
  const o = over || {};
  const deps = {
    state: o.state || { isModelLoaded: false, serverConsent: false },
    local: o.local === null ? null : { run: async (p, opts) => { calls.local.push(p); return (o.localRun || (() => ({ text: task('Wire the money'), tokenProb: 0.97 })))(p, calls.local.length); } },
    server: o.server === null ? null : { call: async (payload) => { calls.server.push(payload); return (o.serverRun || (() => ({ text: task('Wire the money') })))(payload); } },
    shield: o.shield === undefined ? Shield : o.shield, enforce: J, maskIds: o.maskIds || M, timeouts: o.timeouts, minConfidence: o.minConfidence
  };
  return { deps, calls };
}
const run = (over, req) => { const r = rig(over); return R.route(req || { prompt: PROMPT }, r.deps).then((res) => ({ res, calls: r.calls })); };

(async () => {
  console.log('\n--- before the device model is ready ---\n');
  let x = await run({});
  check('no model, no consent: nothing is sent, and the reason says why', x.res.ok === false && x.res.reason === 'needs-consent' && x.calls.server.length === 0, x.res);
  x = await run({ state: { isModelLoaded: false, serverConsent: true } });
  check('no model, consent: the server answers (Tier 1)', x.res.ok === true && x.res.tier === 'server' && x.res.action.action === 'create_task', x.res);
  check('what the server received is masked: no name, amount, account, date or phone', x.calls.server.length === 1 && !/Dana|3,850|99887766|2026-10-09|972/.test(JSON.stringify(x.calls.server[0])), x.calls.server[0]);
  check('the payload carries only the masked prompt, the instructions and the language: no token map', Object.keys(x.calls.server[0]).sort().join() === 'instructions,lang,maskedPrompt');
  check('the server was told to answer in JSON only', /ONLY valid JSON/.test(x.calls.server[0].instructions));
  check('no consent and no server wired: no-route / needs-consent, not a throw', (await run({ server: null })).res.reason === 'needs-consent' || (await run({ server: null })).res.reason === 'no-route');

  console.log('\n--- the device model answers (Tier 2) ---\n');
  x = await run({ state: { isModelLoaded: true, serverConsent: true } });
  check('two askings agree and the model is sure: the answer stays on the device', x.res.ok && x.res.tier === 'local' && x.res.confidence >= 0.85 && x.calls.server.length === 0, x.res);
  check('the two askings used two different wordings', x.calls.local.length === 2 && x.calls.local[0] !== x.calls.local[1] && /ONLY valid JSON/.test(x.calls.local[0]) && /single JSON object/.test(x.calls.local[1]));
  x = await run({ state: { isModelLoaded: true, serverConsent: false }, localRun: () => ({ text: JSON.stringify({ action: 'none', reason: 'unclear' }), tokenProb: 0.99 }) });
  check('a sure "none" is an answer: no escalation, no upload', x.res.ok && x.res.action.action === 'none' && x.calls.server.length === 0);

  console.log('\n--- Tier 3: the fallback from the device to the server ---\n');
  const loaded = { isModelLoaded: true, serverConsent: true };
  x = await run({ state: loaded, localRun: (p, n) => ({ text: n === 1 ? task('Wire the money') : task('Pay the invoice'), tokenProb: 0.99 }) });
  check('the two askings disagree on a field: confidence 0.6, below 0.85, the server is asked', x.res.tier === 'server-fallback' && x.res.trace.indexOf('local-low-confidence') >= 0, x.res);
  x = await run({ state: loaded, localRun: (p, n) => ({ text: n === 1 ? task('Wire the money') : JSON.stringify({ action: 'none', reason: 'x' }), tokenProb: 0.99 }) });
  check('the two askings disagree on the action: fallback', x.res.tier === 'server-fallback');
  x = await run({ state: loaded, localRun: () => ({ text: task('Wire the money'), tokenProb: 0.7 }) });
  check('a token probability of 0.7 on identical answers is below 0.85: fallback', x.res.tier === 'server-fallback');
  x = await run({ state: loaded, localRun: () => ({ text: 'I think you should pay it.', tokenProb: 0.99 }) });
  check('a malformed local answer: fallback, no crash', x.res.tier === 'server-fallback' && x.res.trace.indexOf('local-no-object') >= 0);
  x = await run({ state: loaded, localRun: () => { throw new Error('WebGPU device lost'); } });
  check('a local runtime error: fallback', x.res.tier === 'server-fallback' && /local-error/.test(x.res.trace[0]));
  x = await run({ state: loaded, timeouts: { local: 30 }, localRun: () => new Promise(() => {}) });
  check('a local timeout: fallback', x.res.tier === 'server-fallback' && /local-error:local-timeout/.test(x.res.trace[0]), x.res);
  x = await run({ state: { isModelLoaded: true, serverConsent: false }, localRun: () => ({ text: 'nonsense', tokenProb: 0.99 }) });
  check('the device is unsure and there is no consent: silence, and nothing uploaded', x.res.ok === false && x.res.reason === 'low-confidence-needs-consent' && x.calls.server.length === 0, x.res);
  x = await run({ state: loaded, minConfidence: 0.5, localRun: (p, n) => ({ text: task(n === 1 ? 'a' : 'b'), tokenProb: 0.99 }) });
  check('the threshold is configurable (0.6 passes a 0.5 bar)', x.res.tier === 'local');

  console.log('\n--- the mask is a hard gate ---\n');
  x = await run({ state: { isModelLoaded: false, serverConsent: true }, shield: { mask: (t) => ({ maskedText: t, tokenMap: {}, counts: { total: 0 } }) }, maskIds: { maskAll: (t, s) => ({ maskedText: t, tokenMap: {}, counts: {} }), unmask: M.unmask } });
  check('a mask that leaves an e-mail or a phone in the text: nothing is sent', x.res.reason === 'pii-blocked' && x.calls.server.length === 0, x.res);
  x = await run({ state: { isModelLoaded: false, serverConsent: true }, maskIds: { maskAll: () => ({ maskedText: 'Pay Acme Holdings soon', tokenMap: { '[COMPANY_A]': 'Acme Holdings' }, counts: {} }), unmask: M.unmask } });
  check('a masked value found inside the payload: nothing is sent', x.res.reason === 'mask-failed' && x.calls.server.length === 0, x.res);
  x = await run({ state: { isModelLoaded: false, serverConsent: true }, serverRun: () => ({ text: task('Wire it to [CLIENT_NAME_9]') }) });
  check('a placeholder we never issued: the model invented something, refused', x.res.reason === 'unknown-token', x.res);
  x = await run({ state: { isModelLoaded: false, serverConsent: true }, serverRun: (p) => { const t = (p.maskedPrompt.match(/\[CLIENT_NAME_\d+\]/) || [])[0]; return { text: task('Reply to ' + t) }; } });
  check('a placeholder we did issue is restored locally, on the device', x.res.ok && x.res.action.title === 'Reply to Dana Levi', x.res);
  x = await run({ state: { isModelLoaded: false, serverConsent: true } }, { prompt: 'Please file under ID 123456789012345678901234567890 today.' });
  const idTok = (x.calls.server[0].maskedPrompt.match(/\[ID_\d+\]/) || [])[0];
  x = await run({ state: { isModelLoaded: false, serverConsent: true }, serverRun: () => ({ text: task(((idTok || '[ID_1]') + ' ').repeat(28).trim()) }) }, { prompt: 'Please file under ID 123456789012345678901234567890 today.' });
  check('restoring real values can push a field past its limit: refused after the restore, never truncated silently', x.res.ok === false && x.res.reason === 'invalid-output' && x.res.detail === 'after-restore', x.res);

  console.log('\n--- the server misbehaves ---\n');
  for (const [label, run1] of [['prose', () => ({ text: 'Sure, I will do that.' })], ['truncated JSON', () => ({ text: '{"action":"create_task","ti' })], ['an unknown action', () => ({ text: '{"action":"wire_funds","amount":1}' })], ['null', () => null], ['an empty body', () => ({ text: '' })]]) {
    x = await run({ state: { isModelLoaded: false, serverConsent: true }, serverRun: run1 });
    check('server returns ' + label + ': a refusal, not a crash', x.res.ok === false && x.res.reason === 'invalid-output', x.res);
  }
  x = await run({ state: { isModelLoaded: false, serverConsent: true }, serverRun: () => { throw new Error('502'); } });
  check('server error: a refusal', x.res.reason === 'server-error');
  x = await run({ state: { isModelLoaded: false, serverConsent: true }, timeouts: { server: 30 }, serverRun: () => new Promise(() => {}) });
  check('server timeout: a refusal', x.res.reason === 'server-error' && /timeout/.test(x.res.detail || ''));

  console.log('\n--- it never throws ---\n');
  check('garbage requests', (await Promise.all([null, undefined, {}, { prompt: '' }, { prompt: 5 }].map((q) => R.route(q, rig().deps)))).every((r) => r.ok === false));
  check('garbage deps', (await Promise.all([null, undefined, {}, { enforce: J }].map((d) => R.route({ prompt: 'x' }, d)))).every((r) => r.ok === false));
  check('a state function that throws', (await R.route({ prompt: 'x' }, Object.assign(rig().deps, { state: () => { throw new Error('storage gone'); } }))).reason === 'internal');
  check('an async state function works', (await R.route({ prompt: PROMPT }, Object.assign(rig().deps, { state: async () => ({ isModelLoaded: true, serverConsent: false }) }))).tier === 'local');
  check('every result is a proposal: nothing here writes or sends', (await run({ state: loaded })).res.proposal === true);

  console.log('\n--- the confidence number ---\n');
  const a = { action: 'none', reason: 'x' };
  check('identical answers, token 0.9: 0.9', R.confidence(a, a, [0.9, 0.95]).value === 0.9);
  check('same action, different fields: 0.6', R.confidence({ action: 'create_task', title: 'a' }, { action: 'create_task', title: 'b' }, []).value === 0.6);
  check('different actions: 0', R.confidence(a, { action: 'create_task' }, [1]).value === 0);
  check('no token probabilities reported: counted as 1 and the detail says so', R.confidence(a, a, []).tokenProb === null && R.confidence(a, a, []).value === 1);
  check('key order does not matter for agreement', R.agreement({ action: 'none', reason: 'x' }, { reason: 'x', action: 'none' }) === 1);

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
