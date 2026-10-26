// confirm-signup.js: download link only after confirmed_at is written.
// Run: node netlify/functions/confirm-signup/confirm-signup.test.cjs

const crypto = require('crypto');

process.env.EMAIL_VERIFY_SECRET = 'test-verify-secret';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.RESEND_API_KEY = 'test-resend-key';

let calls = [];
let patchResult = () => ({ ok: true, status: 200, json: async () => [{ id: 1, email: 'ada@example.com' }] });
let waitlistRow = null;
let selectFails = false;
let lookupEmailExpected = null;

global.fetch = async (url, opts) => {
  opts = opts || {};
  const u = String(url);
  calls.push({ url: u, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
  if (u.includes('/rest/v1/waitlist') && opts.method === 'PATCH') return patchResult();
  if (u.includes('/rest/v1/waitlist') && u.includes('select=confirmed_at')) {
    if (lookupEmailExpected) {
      const needle = 'email=eq.' + encodeURIComponent(lookupEmailExpected);
      if (!u.includes(needle)) {
        return { ok: true, status: 200, json: async () => [{ confirmed_at: '2026-01-01T00:00:00.000Z' }] };
      }
    }
    if (selectFails) return { ok: false, status: 500, json: async () => [] };
    return { ok: true, status: 200, json: async () => (waitlistRow ? [waitlistRow] : []) };
  }
  if (u.includes('/rest/v1/waitlist') && u.includes('confirmed_at=not.is.null')) {
    return { ok: true, status: 200, json: async () => [] };
  }
  if (u.includes('send-trial-access') || u.includes('send-playbook') || u.includes('api.resend.com')) {
    return { ok: true, status: 200, text: async () => '' };
  }
  throw new Error('unexpected fetch ' + u);
};

const { handler } = require('./confirm-signup.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function signedQuery(email, lang) {
  const exp = String(Date.now() + 3600000);
  const sig = crypto.createHmac('sha256', process.env.EMAIL_VERIFY_SECRET).update(email + '|' + exp).digest('base64url');
  return { email, exp, sig, lang: lang || 'en', kind: 'trial' };
}

function captureLogs(fn) {
  const lines = [];
  const log = console.log;
  const err = console.error;
  console.log = function () { lines.push(Array.from(arguments).join(' ')); log.apply(console, arguments); };
  console.error = function () { lines.push(Array.from(arguments).join(' ')); err.apply(console, arguments); };
  return fn().finally(() => {
    console.log = log;
    console.error = err;
  }).then(() => lines);
}

async function run() {
  console.log('--- claim failure: no download link ---\n');
  {
    calls = [];
    waitlistRow = null;
    patchResult = () => ({ ok: false, status: 503, json: async () => [] });
    const q = signedQuery('ada@example.com');
    const res = await handler({ queryStringParameters: q });
    check('503 when confirmed_at cannot be written', res.statusCode === 503, res);
    check('write-failure page (EN) is retryable, not invalid-link copy', /Please try again/.test(res.body || '') && /Open this link again/.test(res.body || ''), res.body && res.body.slice(0, 300));
    check('error page has no download button href', !/download-trial-zip/.test(res.body || ''), res.body && res.body.slice(0, 200));
    const trialAccess = calls.find((c) => c.url.includes('send-trial-access'));
    check('send-trial-access not called when claim fails', !trialAccess, calls.map((c) => c.url));
  }

  console.log('\n--- zero-row PATCH without confirmed row: write failure ---\n');
  {
    calls = [];
    waitlistRow = null;
    patchResult = () => ({ ok: true, status: 200, json: async () => [] });
    const q = signedQuery('ghost@example.com');
    const res = await handler({ queryStringParameters: q });
    check('503 when PATCH updates zero rows and no confirmed row exists', res.statusCode === 503, res);
    check('no download link minted on zero-row PATCH', !/download-trial-zip/.test(res.body || ''), res.body);
    check('send-trial-access not called on zero-row PATCH', !calls.some((c) => c.url.includes('send-trial-access')), calls.map((c) => c.url));
  }

  console.log('\n--- write-failure page Hebrew ---\n');
  {
    calls = [];
    waitlistRow = null;
    patchResult = () => ({ ok: true, status: 200, json: async () => [] });
    const q = signedQuery('ghost@example.com', 'he');
    const res = await handler({ queryStringParameters: q });
    check('write-failure page (HE) uses distinct retry copy', /נסו שוב/.test(res.body || '') && /פתחו את הקישור שוב/.test(res.body || ''), res.body && res.body.slice(0, 400));
  }

  console.log('\n--- claim success: trial may issue link ---\n');
  {
    calls = [];
    waitlistRow = null;
    patchResult = () => ({ ok: true, status: 200, json: async () => [{ id: 2, email: 'bob@example.com' }] });
    const q = signedQuery('bob@example.com');
    let res;
    const logLines = await captureLogs(async () => { res = await handler({ queryStringParameters: q }); });
    check('200 on successful claim', res.statusCode === 200, res);
    check('success page includes download button', /download-trial-zip/.test(res.body || ''), res.body && res.body.indexOf('id="dl"'));
    const trialAccess = calls.find((c) => c.url.includes('send-trial-access'));
    check('send-trial-access receives a signed downloadUrl', Boolean(trialAccess && trialAccess.body && trialAccess.body.downloadUrl), trialAccess && trialAccess.body && { hasUrl: !!trialAccess.body.downloadUrl });
    const leaked = logLines.some((line) => /download-trial-zip/.test(line) || (trialAccess && trialAccess.body && line.includes(trialAccess.body.downloadUrl)));
    check('M5: signed download link never appears in function logs', !leaked, logLines.filter((l) => /confirm-signup/.test(l)));
  }

  console.log('\n--- Z2: lookup shows confirmed_at null is not already confirmed ---\n');
  {
    calls = [];
    waitlistRow = { confirmed_at: null };
    lookupEmailExpected = 'pending@example.com';
    patchResult = () => ({ ok: true, status: 200, json: async () => [] });
    const q = signedQuery('pending@example.com');
    const res = await handler({ queryStringParameters: q });
    check('Z2: zero-row PATCH with confirmed_at null lookup returns 503', res.statusCode === 503, res);
    check('Z2: no download link when row is still unconfirmed', !/download-trial-zip/.test(res.body || ''), res.body);
    lookupEmailExpected = null;
    waitlistRow = null;
  }

  console.log('\n--- Z7: lookup must filter by email (trap if filter dropped) ---\n');
  {
    calls = [];
    waitlistRow = null;
    lookupEmailExpected = 'trap@example.com';
    patchResult = () => ({ ok: true, status: 200, json: async () => [] });
    const q = signedQuery('trap@example.com');
    const res = await handler({ queryStringParameters: q });
    check('Z7: zero-row PATCH with email-scoped lookup returns 503 not false re-download', res.statusCode === 503, res);
    check('Z7: lookup GET included email=eq filter', calls.some((c) => c.method === 'GET' && c.url.includes('select=confirmed_at') && c.url.includes('email=eq.' + encodeURIComponent('trap@example.com'))), calls.filter((c) => c.method === 'GET'));
    lookupEmailExpected = null;
  }

  console.log('\n--- Z3: lookup HTTP error is not treated as confirmed ---\n');
  {
    calls = [];
    waitlistRow = null;
    selectFails = true;
    patchResult = () => ({ ok: true, status: 200, json: async () => [] });
    const q = signedQuery('lookup-fail@example.com');
    const res = await handler({ queryStringParameters: q });
    check('Z3: zero-row PATCH with failed lookup returns 503', res.statusCode === 503, res);
    check('Z3: no download link when lookup fails', !/download-trial-zip/.test(res.body || ''), res.body);
    selectFails = false;
  }

  console.log('\n--- already confirmed: zero-row PATCH still allows re-download ---\n');
  {
    calls = [];
    waitlistRow = { confirmed_at: '2026-01-01T00:00:00.000Z' };
    patchResult = () => ({ ok: true, status: 200, json: async () => [] });
    const q = signedQuery('repeat@example.com');
    let res;
    const logLines = await captureLogs(async () => { res = await handler({ queryStringParameters: q }); });
    check('200 when row was already confirmed', res.statusCode === 200, res);
    check('re-visit still shows download button', /download-trial-zip/.test(res.body || ''), res.body);
    check('send-trial-access skipped on re-visit', !calls.some((c) => c.url.includes('send-trial-access')), calls.map((c) => c.url));
    check('M5b: re-visit does not log the download URL', !logLines.some((line) => /download-trial-zip/.test(line)), logLines.filter((l) => /confirm-signup/.test(l)));
    const revisitPatch = calls.find((c) => c.method === 'PATCH');
    check('Z7: re-visit PATCH still scopes by email', revisitPatch && revisitPatch.url.includes('email=eq.' + encodeURIComponent('repeat@example.com')), revisitPatch && revisitPatch.url);
    check('Z2: re-visit PATCH only targets confirmed_at null rows', revisitPatch && revisitPatch.url.includes('confirmed_at=is.null'), revisitPatch && revisitPatch.url);
  }

  console.log('\n--- Z2b/Z7b: first-visit PATCH URL must scope email and null confirmed_at ---\n');
  {
    calls = [];
    waitlistRow = null;
    const email = 'patch-filter@example.com';
    patchResult = () => ({ ok: true, status: 200, json: async () => [{ id: 9, email }] });
    const q = signedQuery(email);
    const res = await handler({ queryStringParameters: q });
    check('200 on first successful claim', res.statusCode === 200, res);
    const patch = calls.find((c) => c.method === 'PATCH');
    check('Z7: claim PATCH filters by email', patch && patch.url.includes('email=eq.' + encodeURIComponent(email)), patch && patch.url);
    check('Z2: claim PATCH only targets confirmed_at null rows', patch && patch.url.includes('confirmed_at=is.null'), patch && patch.url);
  }

  console.log('\n--- missing EMAIL_VERIFY_SECRET: invalid page, no PATCH or trial access ---\n');
  {
    const saved = process.env.EMAIL_VERIFY_SECRET;
    delete process.env.EMAIL_VERIFY_SECRET;
    const exp = String(Date.now() + 3600000);
    const email = 'nosecret@example.com';
    const sigVariants = [
      '',
      'undefined',
      crypto.createHmac('sha256', saved).update(email + '|' + exp).digest('base64url')
    ];
    for (const sig of sigVariants) {
      calls = [];
      const res = await handler({
        queryStringParameters: { email, exp, sig, lang: 'en', kind: 'trial' }
      });
      check('missing secret rejects sig=' + JSON.stringify(sig), res.statusCode === 400 && /isn.t valid|isn't valid|invalid/i.test(res.body || ''), res.statusCode);
      check('missing secret: no PATCH for sig=' + JSON.stringify(sig), !calls.some((c) => c.method === 'PATCH'), calls);
      check('missing secret: no send-trial-access for sig=' + JSON.stringify(sig), !calls.some((c) => c.url.includes('send-trial-access')), calls);
    }
    process.env.EMAIL_VERIFY_SECRET = saved;
  }

  console.log('\n--- Z4: PATCH HTTP 500 is write failure with no lookup GET ---\n');
  {
    calls = [];
    waitlistRow = null;
    patchResult = () => ({ ok: false, status: 500, json: async () => [] });
    const q = signedQuery('patch-500@example.com');
    const res = await handler({ queryStringParameters: q });
    check('Z4: PATCH HTTP 500 returns 503', res.statusCode === 503, res);
    check('Z4: no lookup GET after failed PATCH', !calls.some((c) => c.method === 'GET' && c.url.includes('select=confirmed_at')), calls.map((c) => ({ method: c.method, url: c.url })));
    check('Z4: no download link on PATCH failure', !/download-trial-zip/.test(res.body || ''), res.body);
  }

  console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
  process.exit(failures ? 1 : 0);
}
run();
