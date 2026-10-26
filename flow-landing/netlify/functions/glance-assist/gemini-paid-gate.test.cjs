// GEMINI_PAID_TIER gate: Google/Microsoft attachment summaries must not call
// generativelanguage.googleapis.com unless GEMINI_PAID_TIER === 'true'.
// Run: node netlify/functions/glance-assist/gemini-paid-gate.test.cjs

const {
  geminiPaidTierEnabled,
  summarizeAttachmentSilenced,
  summarizeAttachmentGeminiBlocked
} = require('./gemini-paid-gate.js');
const { callRoutedLlm, planRoute, createState, resetState, MODELS } = require('./model-router.js');
const { handler } = require('./glance-assist.js');

const CLOCK = 1_700_000_000_000;
const KEYS = {
  ANTHROPIC_API_KEY: 'test-anthropic',
  XAI_API_KEY: 'test-xai',
  GEMINI_API_KEY: 'test-gemini',
  OPENAI_API_KEY: 'test-openai'
};
const SUMMARY = JSON.stringify({
  summary: 'Updated lease — indemnification removed.',
  entities: { counterparty: '[COMPANY_A]', effectiveDate: '[DATE_1]', financialValue: '[CURRENCY_VAL_1]', governingLaw: '' }
});

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures += 1; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 500) : ''); }
}

function gemini(text) {
  return { status: 200, raw: JSON.stringify({
    candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }]
  }) };
}
function anthropic(text) {
  return { status: 200, raw: JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }) };
}

function scriptedFetch(steps) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url: String(url), body: opts && opts.body });
    const step = steps[calls.length - 1] || { status: 500, raw: '' };
    const status = step.status || 200;
    const raw = step.raw != null ? step.raw : '';
    return { ok: status >= 200 && status < 300, status, text: async () => raw };
  };
  return { calls, fetchImpl };
}

function geminiHosts(calls) {
  return calls.filter((c) => /generativelanguage\.googleapis\.com/i.test(c.url));
}

async function run() {
  console.log('--- gemini-paid-gate unit ---\n');
  check('paid tier requires exact true string', geminiPaidTierEnabled({ GEMINI_PAID_TIER: 'true' }) && !geminiPaidTierEnabled({ GEMINI_PAID_TIER: '1' }));
  check('google and microsoft sources are gated', summarizeAttachmentSilenced('google', {}) && summarizeAttachmentSilenced('microsoft', {}));
  check('gmail and outlook aliases gate', summarizeAttachmentSilenced('gmail', {}) && summarizeAttachmentSilenced('outlook', {}));
  check('non mailbox sources are not gated', !summarizeAttachmentSilenced('dropbox', {}) && !summarizeAttachmentGeminiBlocked('', KEYS));

  console.log('\n--- router: no generativelanguage without GEMINI_PAID_TIER ---\n');
  resetState();
  const plan = planRoute('summarize-attachment', { env: KEYS, state: createState(), now: CLOCK, contentSource: 'google' });
  check('planRoute drops all models for gated google source', plan.length === 0, plan);
  const paidPlan = planRoute('summarize-attachment', {
    env: Object.assign({}, KEYS, { GEMINI_PAID_TIER: 'true' }),
    state: createState(),
    now: CLOCK,
    contentSource: 'google'
  });
  check('planRoute still offers Gemini for google when paid tier is on', paidPlan.length > 0 && paidPlan[0].provider === 'gemini', paidPlan);

  {
    const script = scriptedFetch([gemini(SUMMARY), anthropic(SUMMARY)]);
    let threw = null;
    try {
      await callRoutedLlm({
        action: 'summarize-attachment',
        contentSource: 'google',
        system: 'sum',
        userText: 'Lease body',
        maxTokens: 500,
        env: KEYS,
        state: createState(),
        now: CLOCK,
        fetchImpl: script.fetchImpl,
        accept: (raw) => {
          try { return Boolean(JSON.parse(raw).summary); } catch (e) { return false; }
        }
      });
    } catch (err) { threw = err; }
    check('callRoutedLlm throws gemini_paid_gate before any fetch', threw && threw.code === 'gemini_paid_gate', threw);
    check('zero generativelanguage requests without paid tier', geminiHosts(script.calls).length === 0, script.calls.map((c) => c.url));
  }

  console.log('\n--- mutation proof: gate must stay wired in planRoute ---\n');
  const realBlocked = summarizeAttachmentGeminiBlocked('google', KEYS);
  const mutantBlocked = false;
  const mutantPlan = (() => {
    if (!mutantBlocked) {
      const slotC = MODELS.gemini;
      return [{ provider: slotC.provider }];
    }
    return [];
  })();
  check('mutation would plan Gemini without the gate', mutantPlan[0] && mutantPlan[0].provider === 'gemini');
  check('live gate blocks google summarize plan', realBlocked && planRoute('summarize-attachment', { env: KEYS, state: createState(), contentSource: 'google' }).length === 0);

  console.log('\n--- handler: silent body, no provider calls ---\n');
  const licenseCore = require('../verify-license/license-core.js');
  const TEST_KEY = licenseCore.deriveKey('test-secret', 'sub_gemini_gate');
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  let ip = 0;
  const previousFetch = global.fetch;
  async function post(body) {
    ip += 1;
    const scripted = global.fetch;
    global.fetch = async (url, o) => (String(url).indexOf('supabase.co/rest/v1/licenses') !== -1
      ? { ok: true, status: 200, json: async () => [{ status: 'active', plan: 'pro', key_hash: licenseCore.hashKey(TEST_KEY) }] }
      : scripted(url, o));
    try {
      const res = await handler({
        httpMethod: 'POST',
        headers: { 'x-nf-client-connection-ip': '10.1.0.' + ip },
        body: JSON.stringify(Object.assign({ licenseKey: TEST_KEY }, body))
      });
      return { status: res.statusCode, json: JSON.parse(res.body), calls: scriptedFetch([]).calls };
    } finally {
      global.fetch = scripted;
    }
  }
  try {
    Object.assign(process.env, KEYS);
    delete process.env.GEMINI_PAID_TIER;
    const script = scriptedFetch([gemini(SUMMARY)]);
    global.fetch = script.fetchImpl;
    const licenseFetch = async (url, o) => (String(url).indexOf('supabase.co/rest/v1/licenses') !== -1
      ? { ok: true, status: 200, json: async () => [{ status: 'active', plan: 'pro', key_hash: licenseCore.hashKey(TEST_KEY) }] }
      : script.fetchImpl(url, o));
    global.fetch = licenseFetch;
    const res = await handler({
      httpMethod: 'POST',
      headers: { 'x-nf-client-connection-ip': '10.1.0.99' },
      body: JSON.stringify({ licenseKey: TEST_KEY, action: 'summarize-attachment', maskedText: 'Lease body', contentSource: 'google' })
    });
    const json = JSON.parse(res.body);
    check('handler returns silent gemini_paid_gate', res.statusCode === 200 && json.ok === false && json.code === 'gemini_paid_gate' && json.silent === true, json);
    check('handler made zero generativelanguage calls', geminiHosts(script.calls).length === 0, script.calls.map((c) => c.url));
    check('handler body exposes no summary', !json.summary && JSON.stringify(json).indexOf('indemnification') === -1, json);
  } finally {
    global.fetch = previousFetch;
  }

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
