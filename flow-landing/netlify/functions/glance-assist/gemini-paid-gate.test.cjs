// GEMINI_PAID_TIER gate: fail-closed unless paid tier or allowlisted source.
// Run: node netlify/functions/glance-assist/gemini-paid-gate.test.cjs

const fs = require('fs');
const path = require('path');
const {
  geminiPaidTierEnabled,
  normalizeContentSource,
  summarizeAttachmentSilenced,
  summarizeAttachmentGeminiBlocked,
  summarizeAttachmentAllowed
} = require('./gemini-paid-gate.js');
const { callRoutedLlm, planRoute, createState, resetState } = require('./model-router.js');
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
  console.log('--- fail-closed sources ---\n');
  const blockedCases = [
    ['missing', undefined],
    ['empty', ''],
    ['null', null],
    ['google-drive', 'google-drive'],
    ['onedrive', 'onedrive'],
    ['Gmail alias', 'Gmail'],
    ['outlook spaced', ' OUTLOOK '],
    ['unknown', 'unknown']
  ];
  for (const [label, src] of blockedCases) {
    check('blocked without paid tier: ' + label, summarizeAttachmentSilenced(src, KEYS), src);
  }
  check('GOOGLE uppercase normalizes to google and blocks', summarizeAttachmentSilenced('GOOGLE', KEYS));
  check('dropbox on allowlist is not silenced', summarizeAttachmentAllowed('dropbox', KEYS));
  check('paid tier allows google', summarizeAttachmentAllowed('google', Object.assign({}, KEYS, { GEMINI_PAID_TIER: 'true' })));

  console.log('\n--- mutation: lowercase normalization must stay ---\n');
  const gateSrc = fs.readFileSync(path.join(__dirname, 'gemini-paid-gate.js'), 'utf8');
  check('normalizeContentSource uses toLowerCase in source', /\.toLowerCase\(\)/.test(gateSrc));
  check('GOOGLE blocks only with lowercase normalization', normalizeContentSource('GOOGLE') === 'google' && summarizeAttachmentSilenced('GOOGLE', KEYS));

  console.log('\n--- router ---\n');
  resetState();
  check('planRoute empty for google without paid tier', planRoute('summarize-attachment', { env: KEYS, state: createState(), now: CLOCK, contentSource: 'google' }).length === 0);
  const paidPlan = planRoute('summarize-attachment', {
    env: Object.assign({}, KEYS, { GEMINI_PAID_TIER: 'true' }),
    state: createState(),
    now: CLOCK,
    contentSource: 'google'
  });
  check('planRoute offers Gemini when paid tier on', paidPlan.length > 0 && paidPlan[0].provider === 'gemini', paidPlan);
  const allowPlan = planRoute('summarize-attachment', { env: KEYS, state: createState(), now: CLOCK, contentSource: 'dropbox' });
  check('planRoute offers Gemini for allowlisted dropbox', allowPlan.length > 0 && allowPlan[0].provider === 'gemini', allowPlan);

  {
    const script = scriptedFetch([gemini(SUMMARY)]);
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
        accept: (raw) => { try { return Boolean(JSON.parse(raw).summary); } catch (e) { return false; } }
      });
    } catch (err) { threw = err; }
    check('callRoutedLlm throws gemini_paid_gate for google', threw && threw.code === 'gemini_paid_gate', threw);
    check('zero generativelanguage without paid tier', geminiHosts(script.calls).length === 0, script.calls.map((c) => c.url));
  }

  console.log('\n--- mutation proof: planRoute must call gate helper ---\n');
  const routerSrc = fs.readFileSync(path.join(__dirname, 'model-router.js'), 'utf8');
  check('model-router imports gemini-paid-gate', /gemini-paid-gate\.js/.test(routerSrc));
  check('planRoute calls summarizeAttachmentGeminiBlocked', /summarizeAttachmentGeminiBlocked\(opts\.contentSource/.test(routerSrc));

  console.log('\n--- handler ---\n');
  const licenseCore = require('../verify-license/license-core.js');
  const TEST_KEY = licenseCore.deriveKey('test-secret', 'sub_gemini_gate');
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  const previousFetch = global.fetch;
  try {
    Object.assign(process.env, KEYS);
    delete process.env.GEMINI_PAID_TIER;
    const script = scriptedFetch([gemini(SUMMARY)]);
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
    check('handler silent gemini_paid_gate for google', res.statusCode === 200 && json.ok === false && json.code === 'gemini_paid_gate' && json.silent === true, json);
    check('handler zero generativelanguage', geminiHosts(script.calls).length === 0, script.calls.map((c) => c.url));
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
