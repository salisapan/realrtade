// The Chrome side of the hybrid execution path with a fake chrome: the runtime's capability and refusal logic, the worker's consent and
// message routing, and the whole path (content-script client -> worker -> offscreen -> router) with a fake model and a fake server.
// Run: node test/hybrid-path-corpus.cjs
global.FlowCapability = require('../core/capability.js').FlowCapability;
const { FlowHybridRuntime: R } = require('../src/hybrid-runtime.js');
const { FlowHybridSW: SW } = require('../src/hybrid-sw.js');
const { FlowJsonEnforce: J } = require('../core/json-enforce.js');
const { FlowMaskIds: M } = require('../core/mask-ids.js');
const { FlowPrivacyShield: Shield } = require('../core/privacyShield.js');
const { FlowExecRouter: Router } = require('../core/exec-router.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const GiB = 1024 * 1024 * 1024;
const gpu = (o) => ({ requestAdapter: async () => (o === null ? null : { features: new Set(o && o.f16 === false ? [] : ['shader-f16']), limits: { maxBufferSize: (o && o.maxBuffer) || 2 * GiB } }) });

(async () => {
  console.log('\n--- the runtime: what this machine can run ---\n');
  check('no WebGPU: unsupported with the reason', (await R.capabilities({ navigator: {} })).reason === 'no-webgpu');
  check('WebGPU but no adapter', (await R.capabilities({ navigator: { gpu: gpu(null) } })).reason === 'no-gpu-adapter');
  check('an adapter that throws is the same as no adapter', (await R.capabilities({ navigator: { gpu: { requestAdapter: async () => { throw new Error('blocked'); } } } })).reason === 'no-gpu-adapter');
  check('no shader-f16: the 4-bit f16 builds cannot run', (await R.capabilities({ navigator: { gpu: gpu({ f16: false }) } })).reason === 'no-shader-f16');
  check('not enough free disk for the model plus 20%', (await R.capabilities({ navigator: { gpu: gpu({}) }, storage: { estimate: async () => ({ quota: 3e9, usage: 1.5e9 }) } }, 2.2e9)).reason === 'low-storage');
  const okCaps = await R.capabilities({ navigator: { gpu: gpu({ maxBuffer: 4 * GiB }) }, storage: { estimate: async () => ({ quota: 50e9, usage: 1e9 }) } }, 2.2e9);
  check('a capable machine is accepted', okCaps.ok === true && okCaps.maxBufferSize === 4 * GiB);
  check('an unknown storage estimate does not block', (await R.capabilities({ navigator: { gpu: gpu({}) }, storage: { estimate: async () => { throw new Error('x'); } } }, 2.2e9)).ok === true);
  check('the small model is the default', R.pick('phi-3-mini', okCaps, { deviceMemory: 8 }) === 'phi-3-mini' && R.pick(undefined, okCaps, { deviceMemory: 8 }) === 'phi-3-mini');
  check('the 8B model is never picked while its library is not in the package (the +12 MB budget)', R.pick('llama-3-8b', okCaps, { deviceMemory: 8 }) === 'phi-3-mini');
  check('WebLLM\'s own published memory needs are recorded', R.CATALOG['phi-3-mini'].vramMB > 3600 && R.CATALOG['llama-3-8b'].vramMB > 4900);

  console.log('\n--- the runtime: starting the engine ---\n');
  const manifest = { revision: 'abc123def', id: 'x' };
  const goodLib = 'chrome-extension://abcdef/vendor/Phi-3-mini-4k-instruct-q4f16_1-webgpu.wasm';
  let cfg = null;
  const fakeMod = { CreateMLCEngine: async (id, c) => { cfg = { id, c }; return { engine: true }; } };
  check('a remotely hosted WASM is refused: it is code', (await R.start({ modelKey: 'phi-3-mini', manifest, libUrl: 'https://raw.githubusercontent.com/x/y.wasm', importer: async () => fakeMod })).reason === 'model-lib-not-bundled');
  check('an unknown model key is refused', (await R.start({ modelKey: 'gpt-x', manifest, libUrl: goodLib, importer: async () => fakeMod })).reason === 'bad-config');
  check('a missing runtime file fails closed', (await R.start({ modelKey: 'phi-3-mini', manifest, libUrl: goodLib, importer: async () => { throw new Error('404'); } })).reason === 'runtime-missing');
  check('a runtime without the expected API fails closed', (await R.start({ modelKey: 'phi-3-mini', manifest, libUrl: goodLib, importer: async () => ({}) })).reason === 'runtime-missing');
  check('an engine that fails to start (out of memory) is a reason, not a throw', /^engine-failed:out of memory/.test((await R.start({ modelKey: 'phi-3-mini', manifest, libUrl: goodLib, importer: async () => ({ CreateMLCEngine: async () => { throw new Error('out of memory'); } }) })).reason));
  const started = await R.start({ modelKey: 'phi-3-mini', manifest, libUrl: goodLib, importer: async () => fakeMod });
  check('a good start returns the engine', started.ok === true && started.engine.engine === true);
  check('the engine is pointed at the PINNED commit and the bundled lib, in the browser cache', cfg.c.appConfig.model_list[0].model === 'https://huggingface.co/mlc-ai/Phi-3-mini-4k-instruct-q4f16_1-MLC/resolve/abc123def/' && cfg.c.appConfig.model_list[0].model_lib === goodLib && cfg.c.appConfig.cacheBackend === 'cache', cfg);

  console.log('\n--- the runtime: one inference ---\n');
  let sent = null;
  const engine = { chat: { completions: { create: async (req) => { sent = req; return { choices: [{ message: { content: '{"action":"none","reason":"x"}' }, logprobs: { content: [{ logprob: -0.01 }, { logprob: -0.2231 }, { logprob: -0.0001 }] } }] }; } } } };
  const out = await R.infer(engine, 'hello', { schema: J.toJsonSchema(J.ACTION_SCHEMA), maxTokens: 123 });
  check('it returns the text and the LOWEST token probability (exp of the worst logprob)', out.text === '{"action":"none","reason":"x"}' && out.tokenProb === 0.8, out);
  check('greedy, schema-constrained, with logprobs requested', sent.temperature === 0 && sent.logprobs === true && sent.max_tokens === 123 && sent.response_format.type === 'json_object' && JSON.parse(sent.response_format.schema).oneOf.length === 4, sent);
  check('an engine that reports no logprobs gives no probability (the router then counts it as 1 and says so)', (await R.infer({ chat: { completions: { create: async () => ({ choices: [{ message: { content: '{}' } }] }) } } }, 'x')).tokenProb === undefined);
  check('an empty reply is an empty string, not a crash', (await R.infer({ chat: { completions: { create: async () => ({}) } } }, 'x')).text === '');

  console.log('\n--- the worker: with a fake chrome ---\n');
  function fakeChrome() {
    const store = {}, alarms = {}, listeners = { alarm: [], startup: [], installed: [] }, log = { offscreenCreated: 0, offscreenClosed: 0, toOffscreen: [], cleared: [] };
    let offscreenOpen = false;
    const chrome = {
      runtime: { id: 'me', getContexts: async () => (offscreenOpen ? [{}] : []), sendMessage: async (m) => { log.toOffscreen.push(m); return (chrome._offscreen || (() => ({ ok: true })))(m); },
        onStartup: { addListener: (f) => listeners.startup.push(f) }, onInstalled: { addListener: (f) => listeners.installed.push(f) } },
      offscreen: { createDocument: async () => { if (offscreenOpen) throw new Error('Only a single offscreen document may be created.'); offscreenOpen = true; log.offscreenCreated++; },
        closeDocument: async () => { offscreenOpen = false; log.offscreenClosed++; } },
      storage: { local: { get: async (k) => (typeof k === 'string' ? { [k]: store[k] } : {}), set: async (o) => { Object.assign(store, o); }, remove: async (k) => { delete store[k]; } } },
      alarms: { create: (n, o) => { alarms[n] = o; }, clear: async (n) => { delete alarms[n]; log.cleared.push(n); }, onAlarm: { addListener: (f) => listeners.alarm.push(f) } }
    };
    return { chrome, store, alarms, log, listeners, isOpen: () => offscreenOpen };
  }
  const popup = { id: 'me' }, tab = { id: 'me', tab: { id: 7 } }, page = { id: 'me' };
  const ON = { enabled: true, autoDownload: false, serverFallback: false };
  const starts = (f) => f.log.toOffscreen.filter((m) => m.type === 'hybrid:start').length;
  const eligible = () => ({ ok: true, eligible: true, model: 'phi-3-mini', downloadBytes: 2152379174 });
  const incapable = (reason) => ({ ok: true, eligible: false, reason, permanent: true });
  let assistCalls = [];
  const mk = (f, config) => SW.create(f.chrome, { config, callAssist: async (b) => { assistCalls.push(b); return { ok: true, text: JSON.stringify({ action: 'none', reason: 'x' }) }; } });

  console.log('--- disabled (this build): nothing happens ---');
  let f = fakeChrome();
  let sw = mk(f, { enabled: false, autoDownload: true, serverFallback: true });
  check('status says the path is not enabled', (await sw.handle({ type: 'flow:hybrid-status' }, tab)).enabled === false);
  check('consent is refused: not enabled', (await sw.handle({ type: 'flow:hybrid-consent', patch: { localModel: true } }, popup)).reason === 'not-enabled');
  check('the server call is refused even with serverFallback in the config', (await sw.handle({ type: 'flow:execute', payload: { maskedPrompt: 'x' } }, tab)).reason === 'needs-consent' && assistCalls.length === 0);
  await sw.boot(); sw.install();
  check('boot and install do nothing: no offscreen page, no probe, no listeners, no messages', f.log.offscreenCreated === 0 && f.log.toOffscreen.length === 0 && f.listeners.alarm.length + f.listeners.startup.length + f.listeners.installed.length === 0);
  check('the isModelLoaded the router sees is false', (await sw.status()).isModelLoaded === false);

  console.log('--- consent and routing ---');
  f = fakeChrome(); assistCalls = [];
  sw = mk(f, ON);
  let st = await sw.handle({ type: 'flow:hybrid-status' }, tab);
  check('enabled, by the config defaults: no model, no server', st.enabled === true && st.isModelLoaded === false && st.serverConsent === false && st.consent.localModel === false);
  check('the config defaults can turn the server fallback on', (await mk(f, { enabled: true, autoDownload: false, serverFallback: true }).status()).serverConsent === true);
  check('a content script cannot give consent or retry', (await sw.handle({ type: 'flow:hybrid-consent', patch: { server: true } }, tab)).reason === 'popup-only' && (await sw.handle({ type: 'flow:hybrid-retry' }, tab)).reason === 'popup-only' && f.store[SW.KEY_CONSENT] === undefined);
  check('a foreign extension is refused', (await sw.handle({ type: 'flow:hybrid-status' }, { id: 'someone-else' })).reason === 'foreign-sender');
  check('unknown messages are left to the worker\'s other handlers', sw.handle({ type: 'flow:draft-reply' }, tab) === undefined && sw.handle(null, tab) === undefined);
  check('the server is refused without server consent', (await sw.handle({ type: 'flow:execute', payload: { maskedPrompt: 'x' } }, tab)).reason === 'needs-consent' && assistCalls.length === 0);
  await sw.handle({ type: 'flow:hybrid-consent', patch: { server: true } }, popup);
  const ex = await sw.handle({ type: 'flow:execute', payload: { maskedPrompt: 'Pay [CLIENT_NAME_1]', lang: 'en' } }, tab);
  check('with consent the masked prompt goes through the licence-checked call', ex.ok && assistCalls.length === 1 && assistCalls[0].action === 'execute' && assistCalls[0].maskedPrompt === 'Pay [CLIENT_NAME_1]');
  const failing = SW.create(f.chrome, { config: ON, callAssist: async () => { const e = new Error('This feature is part of Glance Pro.'); e.status = 402; throw e; } });
  check('a free user (no licence) gets the reason, not a crash', (await failing.handle({ type: 'flow:execute', payload: { maskedPrompt: 'x' } }, tab)).status === 402);
  check('asking the local model before it is loaded is a clear refusal', (await sw.handle({ type: 'flow:hybrid-infer', prompt: 'x' }, tab)).reason === 'not-loaded');

  console.log('--- the silent capability probe comes BEFORE any download ---');
  f = fakeChrome(); sw = mk(f, ON);
  f.chrome._offscreen = (m) => (m.type === 'hybrid:probe' ? eligible() : { ok: true });
  await sw.handle({ type: 'flow:hybrid-consent', patch: { localModel: true } }, popup);
  await new Promise((r) => setTimeout(r, 5));
  const order = f.log.toOffscreen.map((m) => m.type);
  check('capable machine: consent, then the probe, then the start (never the start first)', order.indexOf('hybrid:probe') > order.indexOf('hybrid:consent') && order.indexOf('hybrid:start') > order.indexOf('hybrid:probe'), order);
  f = fakeChrome(); sw = mk(f, ON);
  f.chrome._offscreen = (m) => (m.type === 'hybrid:probe' ? incapable('no-webgpu') : { ok: true });
  await sw.handle({ type: 'flow:hybrid-consent', patch: { localModel: true } }, popup);
  await new Promise((r) => setTimeout(r, 5));
  let fl = (await sw.status()).flags;
  check('an incapable machine: NO download is ever started', starts(f) === 0);
  check('...one permanent flag is set with the reason', fl.disabled && fl.disabled.kind === 'incapable' && fl.disabled.reason === 'no-webgpu', fl);
  check('...the offscreen page is closed and every alarm cleared', f.log.offscreenClosed === 1 && !f.isOpen() && !f.alarms[SW.ALARM_TICK] && !f.alarms[SW.ALARM_RETRY]);
  const created = f.log.offscreenCreated;
  f.log.toOffscreen.length = 0;
  await sw.handle({ type: 'flow:hybrid-consent', patch: { localModel: true } }, popup);
  await sw.boot(); await sw.tick(SW.ALARM_TICK); await sw.tick(SW.ALARM_RETRY);
  check('once disabled, nothing wakes it: no page, no message, no start, however it is asked', f.log.offscreenCreated === created && f.log.toOffscreen.length === 0 && starts(f) === 0);
  check('the flag survives a worker restart (a new worker on the same storage)', (await mk(f, ON).status()).flags.disabled.kind === 'incapable' && (await mk(f, ON).status()).isModelLoaded === false);
  f = fakeChrome(); sw = mk(f, Object.assign({}, ON, { autoDownload: true }));
  f.chrome._offscreen = (m) => (m.type === 'hybrid:probe' ? { ok: true, eligible: false, reason: 'low-storage', permanent: false } : { ok: true });
  await sw.boot();
  check('low disk is NOT permanent: no download, no flag, nothing to retry on a timer', starts(f) === 0 && (await sw.status()).flags.disabled === null);
  f = fakeChrome(); sw = mk(f, Object.assign({}, ON, { autoDownload: true }));
  f.chrome._offscreen = (m) => (m.type === 'hybrid:probe' ? eligible() : { ok: true });
  await sw.boot(); await new Promise((r) => setTimeout(r, 5));
  check('install on a capable machine with autoDownload: probe, then start', starts(f) === 1);
  f = fakeChrome(); sw = mk(f, ON);
  f.chrome._offscreen = (m) => (m.type === 'hybrid:probe' ? eligible() : { ok: true });
  await sw.boot(); await new Promise((r) => setTimeout(r, 5));
  check('without autoDownload or consent nothing is downloaded', starts(f) === 0);

  console.log('--- a failing download backs off, then gives up after three attempts ---');
  f = fakeChrome(); sw = mk(f, ON);
  f.chrome._offscreen = (m) => (m.type === 'hybrid:probe' ? eligible() : { ok: true });
  await sw.handle({ type: 'flow:hybrid-consent', patch: { localModel: true } }, popup);
  const failed = (err) => sw.handle({ type: 'hybrid:state', state: { status: 'failed', lastError: err, isModelLoaded: false } }, page);
  await failed('hash-mismatch:shard-1');
  check('failure 1 (a wrong hash): a retry in 15 minutes, not 30 forever', f.alarms[SW.ALARM_RETRY] && f.alarms[SW.ALARM_RETRY].delayInMinutes === 15 && (await sw.status()).flags.attempts === 1 && (await sw.status()).flags.disabled === null, f.alarms);
  await failed('network:shard-3');
  check('failure 2: a retry in 60 minutes (exponential)', f.alarms[SW.ALARM_RETRY].delayInMinutes === 60 && (await sw.status()).flags.attempts === 2);
  check('the retry alarm is one shot: no period', f.alarms[SW.ALARM_RETRY].periodInMinutes === undefined);
  await failed('manifest-unpinned');
  fl = (await sw.status()).flags;
  check('failure 3: it gives up for good, with the reason', fl.disabled && fl.disabled.kind === 'gave-up' && /manifest-unpinned/.test(fl.disabled.reason) && fl.attempts === 3, fl);
  check('...alarms cleared, offscreen page closed', !f.alarms[SW.ALARM_RETRY] && !f.alarms[SW.ALARM_TICK] && !f.isOpen());
  f.log.toOffscreen.length = 0;
  await sw.tick(SW.ALARM_RETRY); await sw.boot();
  check('...and it never retries again on its own', starts(f) === 0 && f.log.toOffscreen.length === 0);
  f = fakeChrome(); sw = mk(f, ON);
  f.chrome._offscreen = (m) => (m.type === 'hybrid:probe' ? eligible() : { ok: true });
  await sw.handle({ type: 'flow:hybrid-consent', patch: { localModel: true } }, popup);
  await sw.handle({ type: 'hybrid:state', state: { status: 'failed', lastError: 'network:x' } }, page);
  await new Promise((r) => setTimeout(r, 5));                                       // the consent's own start message is sent without being awaited
  f.log.toOffscreen.length = 0;
  await sw.tick(SW.ALARM_RETRY);
  check('a due retry restarts the download', starts(f) === 1);
  await sw.handle({ type: 'hybrid:state', state: { status: 'ready', downloaded: true, isModelLoaded: true } }, page);
  fl = (await sw.status()).flags;
  check('success resets the attempt count and clears the retry alarm', fl.attempts === 0 && !f.alarms[SW.ALARM_RETRY] && (await sw.status()).isModelLoaded === true);
  await sw.handle({ type: 'hybrid:state', state: { status: 'unsupported', unsupportedReason: 'engine-failed:out of memory', isModelLoaded: false } }, page);
  check('an engine that cannot start on this machine (after the files verified) is permanent too', (await sw.status()).flags.disabled.kind === 'incapable' && /engine-failed/.test((await sw.status()).flags.disabled.reason));
  f.log.toOffscreen.length = 0;
  f.chrome._offscreen = (m) => (m.type === 'hybrid:probe' ? eligible() : { ok: true });
  const rr = await sw.handle({ type: 'flow:hybrid-retry' }, popup);
  await new Promise((r) => setTimeout(r, 5));
  check('only the person\'s own "try again" in the popup clears the permanent flag, and it probes before it starts', rr.ok !== false && (await sw.status()).flags.disabled === null && f.log.toOffscreen.map((m) => m.type).indexOf('hybrid:probe') >= 0, f.log.toOffscreen.map((m) => m.type));

  console.log('--- paused is not failed ---');
  f = fakeChrome(); sw = mk(f, ON);
  f.chrome._offscreen = (m) => (m.type === 'hybrid:probe' ? eligible() : { ok: true });
  await sw.handle({ type: 'flow:hybrid-consent', patch: { localModel: true } }, popup);
  await sw.handle({ type: 'hybrid:state', state: { status: 'paused', pausedReason: 'metered' } }, page);
  check('a paused download (metered, offline) wakes every 30 minutes, and does not count as an attempt', f.alarms[SW.ALARM_TICK] && f.alarms[SW.ALARM_TICK].periodInMinutes === 30 && (await sw.status()).flags.attempts === 0);
  await new Promise((r) => setTimeout(r, 5));
  f.log.toOffscreen.length = 0;
  await sw.tick(SW.ALARM_TICK);
  check('its tick resumes it', starts(f) === 1);
  await sw.handle({ type: 'hybrid:state', state: { status: 'downloading' } }, page);
  f.log.toOffscreen.length = 0;
  await sw.tick(SW.ALARM_TICK);
  check('a tick for a download that is no longer paused stops the periodic wake-up', starts(f) === 0 && !f.alarms[SW.ALARM_TICK]);

  console.log('--- the model lifecycle ---');
  f = fakeChrome(); sw = mk(f, ON);
  f.chrome._offscreen = (m) => (m.type === 'hybrid:probe' ? eligible() : m.type === 'hybrid:infer' ? { ok: true, text: '{"action":"none","reason":"y"}', tokenProb: 0.95 } : { ok: true });
  await sw.handle({ type: 'flow:hybrid-consent', patch: { localModel: true } }, popup);
  check('a content script cannot overwrite the mirrored state', (await sw.handle({ type: 'hybrid:state', state: { isModelLoaded: true } }, tab)).reason === 'offscreen-only');
  await sw.handle({ type: 'hybrid:state', state: { status: 'ready', downloaded: true, isModelLoaded: true } }, page);
  check('isModelLoaded is true only with consent AND a loaded model', (await sw.status()).isModelLoaded === true);
  const inf = await sw.handle({ type: 'flow:hybrid-infer', prompt: 'hi', opts: { maxTokens: 50 } }, tab);
  check('inference is forwarded to the offscreen page', inf.ok && inf.tokenProb === 0.95);
  await sw.handle({ type: 'flow:hybrid-consent', patch: { localModel: false } }, popup);
  check('turning it off removes the model, clears the alarms and forgets the state', f.log.toOffscreen.some((m) => m.type === 'hybrid:remove') && !f.alarms[SW.ALARM_TICK] && f.store[SW.KEY_STATE] === undefined && (await sw.status()).isModelLoaded === false);
  const noOff = fakeChrome(); delete noOff.chrome.offscreen;
  check('a browser without the offscreen API: a refusal, not a crash', (await mk(noOff, ON).handle({ type: 'flow:hybrid-consent', patch: { localModel: true } }, popup)).ok === true);

  console.log('\n--- the whole path: executeTask -> worker -> offscreen -> router ---\n');
  f = fakeChrome();
  const serverAnswers = [];
  sw = SW.create(f.chrome, { config: ON, callAssist: async (b) => { serverAnswers.push(b); return { text: JSON.stringify({ action: 'create_task', title: 'Wire the money', dueText: '[DATE_1]' }) }; } });
  f.chrome._offscreen = (m) => (m.type === 'hybrid:probe' ? eligible() : { ok: true });
  global.chrome = { runtime: { lastError: null, sendMessage: (msg, cb) => { Promise.resolve(sw.handle(msg, tab)).then((r) => cb(r)); } } };
  global.FlowJsonEnforce = J; global.FlowMaskIds = M; global.FlowPrivacyShield = Shield; global.FlowExecRouter = Router;
  const { FlowHybrid: H, executeTask } = require('../src/hybrid-client.js');
  const PROMPT = 'Dana Levi writes: please wire $3,850 for account 99887766 by 2026-10-09.';
  let res = await executeTask({ prompt: PROMPT });
  check('executeTask with nothing consented: a reason, and nothing left the device', res.ok === false && res.reason === 'needs-consent' && serverAnswers.length === 0, res);
  await sw.handle({ type: 'flow:hybrid-consent', patch: { server: true } }, popup);
  res = await executeTask({ prompt: PROMPT, lang: 'en' });
  check('server fallback on: the server answers (Tier 1), as a proposal', res.ok && res.tier === 'server' && res.action.action === 'create_task', res);
  check('what the worker sent to the licence-checked call is masked', serverAnswers.length === 1 && !/Dana|3,850|99887766|2026-10-09/.test(JSON.stringify(serverAnswers[0])), serverAnswers[0]);
  res = await executeTask({ prompt: PROMPT, tiers: { server: false } });
  check('a caller can forbid the server tier for one task', res.ok === false && serverAnswers.length === 1, res);
  await sw.handle({ type: 'flow:hybrid-consent', patch: { localModel: true } }, popup);
  await sw.handle({ type: 'hybrid:state', state: { status: 'ready', downloaded: true, isModelLoaded: true } }, page);
  const same = JSON.stringify({ action: 'create_task', title: 'Wire the money', dueText: 'by Friday' });
  f.chrome._offscreen = (m) => (m.type === 'hybrid:infer' ? { ok: true, text: same, tokenProb: 0.97 } : { ok: true });
  serverAnswers.length = 0;
  res = await executeTask({ prompt: PROMPT });
  check('a loaded model that is sure: the answer stays on the device, the server is not called', res.ok && res.tier === 'local' && serverAnswers.length === 0, res);
  let n = 0;
  f.chrome._offscreen = (m) => (m.type === 'hybrid:infer' ? { ok: true, text: JSON.stringify({ action: 'create_task', title: 't' + (++n), dueText: null }), tokenProb: 0.97 } : { ok: true });
  res = await executeTask({ prompt: PROMPT });
  check('a loaded model that is unsure: the masked prompt goes to the server (Tier 3)', res.ok && res.tier === 'server-fallback' && serverAnswers.length === 1, res);
  f.chrome._offscreen = () => ({ ok: false, reason: 'device lost' });
  res = await executeTask({ prompt: PROMPT });
  check('a model error on the device falls back too', res.ok && res.tier === 'server-fallback', res);
  await sw.disable('incapable', 'no-webgpu');
  serverAnswers.length = 0;
  res = await executeTask({ prompt: PROMPT });
  check('on a disabled machine executeTask goes straight to the server and never asks the device', res.ok && res.tier === 'server' && res.trace.indexOf('local-not-loaded') >= 0, res);
  global.chrome.runtime.sendMessage = (msg, cb) => cb(undefined);
  res = await executeTask({ prompt: PROMPT });
  check('a worker that does not answer is a refusal, not a hang or a throw', res.ok === false, res);
  check('executeTask never throws on garbage', (await Promise.all([null, undefined, {}, { prompt: 5 }].map((p) => executeTask(p)))).every((r) => r.ok === false));

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
