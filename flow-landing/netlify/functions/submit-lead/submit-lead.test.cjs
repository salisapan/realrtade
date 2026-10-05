// Failure handling for submit-lead.js.
//
// An enterprise enquiry reaches a person if either the Supabase insert or the
// owner notification email works. fetch is stubbed. Nothing is sent.
//
// There is no CI entry for the flow-landing functions. Run from the repo root:
//   node flow-landing/netlify/functions/submit-lead/submit-lead.test.cjs
// or from flow-landing/:
//   node netlify/functions/submit-lead/submit-lead.test.cjs

const SECRET_DB = 'supabase-service-role-sentinel-9f3a';
const SECRET_MAIL = 'resend-api-sentinel-9f3a';
const SB_LEADS = 'https://zjquktirlrhbqcnkfaok.supabase.co/rest/v1/leads';
const RESEND = 'https://api.resend.com/emails';
const OWNER = 'ai.local.flow@gmail.com';
const HELLO = 'hello@theflow-ai.com';

global.fetch = async (url) => {
  throw new Error('unstubbed fetch: ' + url);
};

const { handler } = require('./submit-lead.js');

let failures = 0;
const calls = [];

function redact(value) {
  return JSON.stringify(value).split(SECRET_DB).join('[redacted]').split(SECRET_MAIL).join('[redacted]');
}

function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures += 1;
    console.log('FAIL:', name, detail !== undefined ? redact(detail).slice(0, 500) : '');
  }
}

function installFetch(decide) {
  global.fetch = async (url, opts) => {
    const entry = { url: String(url), opts };
    calls.push(entry);
    if (entry.url !== SB_LEADS && entry.url !== RESEND) {
      throw new Error('unexpected fetch ' + entry.url);
    }
    const result = decide(entry.url, opts);
    if (result && result.throw) throw new Error(result.throw);
    return {
      ok: Boolean(result.ok),
      status: result.status,
      text: async () => result.text || '',
    };
  };
}

function flat(entries) {
  return entries.map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')).join('\n');
}

function logged(entries, msg) {
  return entries.some((args) => args.includes(msg));
}

async function callHandler(body, ip) {
  const origLog = console.log;
  const origErr = console.error;
  const seenLogs = [];
  const seenErrs = [];
  console.log = (...args) => { seenLogs.push(args); };
  console.error = (...args) => { seenErrs.push(args); };
  try {
    const res = await handler({
      httpMethod: 'POST',
      headers: { 'x-nf-client-connection-ip': ip },
      body: JSON.stringify(body),
    });
    let parsed = null;
    try { parsed = JSON.parse(res.body); } catch (err) { parsed = { _raw: res.body }; }
    return { res, parsed, logs: seenLogs, errors: seenErrs };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

let ipSeq = 0;
function nextIp() {
  ipSeq += 1;
  return '203.0.113.' + ipSeq;
}

function withEnv(vars, fn) {
  const keys = ['SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY'];
  const prev = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of keys) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
    });
}

function takeCalls() {
  const snapshot = calls.slice();
  calls.length = 0;
  return snapshot;
}

function mailOf(call) {
  return JSON.parse(call.opts.body);
}

function assertNoSecrets(text, where) {
  check(where + ' does not contain the service role key', !text.includes(SECRET_DB));
  check(where + ' does not contain the resend key', !text.includes(SECRET_MAIL));
}

const FULL = {
  email: 'buyer@example.com',
  name: 'Ada <Lovelace> & Co',
  company: 'Northwind & Sons',
  role: 'Counsel',
  seats: '26-50',
  deployment: 'masked-cloud',
  timeline: 'now',
  message: 'a&b<c>d"e\'f',
  source: 'contact',
  lang: 'en',
  website: '',
};

const HAND = {
  email: 'buyer@example.com',
  name: 'Ada <Lovelace> & Co',
  company: 'Northwind & Sons',
  role: '',
  seats: '<script>alert(1)</script>',
  deployment: 'not-sure',
  timeline: 'exploring',
  message: 'Say "hello" <b>now</b>',
  source: 'contact',
  lang: 'he',
  website: '',
};

function expectSuccess(out, label) {
  check(label + ': visitor gets success', out.res.statusCode === 200 && out.parsed.ok === true, out.res);
  check(label + ': success body does not describe the channel failure', out.res.body === '{"ok":true}', out.res.body);
}

function expectHelloError(out, label, status) {
  check(label + ': visitor gets ' + status, out.res.statusCode === status, out.res);
  check(label + ': error points at ' + HELLO, typeof out.parsed.error === 'string' && out.parsed.error.includes(HELLO), out.parsed);
  check(label + ': error is not a success', out.parsed.ok !== true, out.parsed);
}

function expectHandRecord(mail, label) {
  check(label + ': subject says the lead was NOT stored', mail.subject === 'NOT stored in the database: Enterprise enquiry: Northwind & Sons', mail.subject);
  check(label + ': body says the lead was NOT stored', mail.html.includes('<b>This lead was NOT stored in the database.</b>'));
  check(label + ': body says to record it by hand', mail.html.includes('Record it by hand'));
  for (const name of ['Email', 'Name', 'Company', 'Role', 'Seats', 'Deployment', 'Timeline', 'Source', 'Message', 'Language']) {
    check(label + ': includes ' + name, mail.html.includes('>' + name + '</td>'));
  }
  check(label + ': email', mail.html.includes('<b>buyer@example.com</b>'));
  check(label + ': name is escaped', mail.html.includes('<b>Ada &lt;Lovelace&gt; &amp; Co</b>'));
  check(label + ': company is escaped', mail.html.includes('<b>Northwind &amp; Sons</b>'));
  check(label + ': raw company ampersand is not in the html', !mail.html.includes('Northwind & Sons'));
  check(label + ': deployment', mail.html.includes('<b>not-sure</b>'));
  check(label + ': timeline', mail.html.includes('<b>exploring</b>'));
  check(label + ': source', mail.html.includes('<b>contact</b>'));
  check(label + ': language', mail.html.includes('<b>he</b>'));
  check(label + ': message is escaped', mail.html.includes('<b>Say &quot;hello&quot; &lt;b&gt;now&lt;/b&gt;</b>'));
  check(label + ': blank role and rejected seats are both shown', mail.html.split('(not provided)').length - 1 === 2, mail.html.split('(not provided)').length - 1);
  check(label + ': rejected seats text is not in the email', !mail.html.includes('<script') && !mail.html.includes('alert(1)'));
  check(label + ': raw angle brackets are not in the email', !mail.html.includes('<Lovelace>') && !mail.html.includes('<b>now</b>'));
  check(label + ': owner recipient', JSON.stringify(mail.to) === JSON.stringify([OWNER]));
  check(label + ': reply-to is the visitor', mail.reply_to === 'buyer@example.com');
  check(label + ': from address', mail.from === 'Flow <hello@theflow-ai.com>');
}

function bothKeys() {
  return { SUPABASE_SERVICE_ROLE_KEY: SECRET_DB, RESEND_API_KEY: SECRET_MAIL };
}

async function run() {
  console.log('--- 1. both channels work ---\n');
  await withEnv(bothKeys(), async () => {
    installFetch((url) => ({ ok: true, status: url === SB_LEADS ? 201 : 200, text: '' }));
    const out = await callHandler(FULL, nextIp());
    const seen = takeCalls();
    expectSuccess(out, 'both ok');
    check('both ok: database then email', seen.length === 2 && seen[0].url === SB_LEADS && seen[1].url === RESEND, seen.map((c) => c.url));
    const stored = JSON.parse(seen[0].opts.body);
    check('both ok: insert is the cleaned lead', JSON.stringify(stored) === JSON.stringify({
      email: 'buyer@example.com',
      name: 'Ada <Lovelace> & Co',
      company: 'Northwind & Sons',
      role: 'Counsel',
      seats: '26-50',
      deployment: 'masked-cloud',
      timeline: 'now',
      message: 'a&b<c>d"e\'f',
      source: 'contact',
      lang: 'en',
    }), stored);
    check('both ok: service role header is the env key', seen[0].opts.headers.Authorization === 'Bearer ' + SECRET_DB && seen[0].opts.headers.apikey === SECRET_DB);
    const mail = mailOf(seen[1]);
    check('both ok: subject stays the stored-lead subject', mail.subject === 'Enterprise enquiry: Northwind & Sons', mail.subject);
    check('both ok: body does not say NOT stored', !mail.html.includes('NOT stored') && !mail.subject.includes('NOT stored'));
    check('both ok: message is escaped in html', mail.html.includes('<b>a&amp;b&lt;c&gt;d&quot;e&#39;f</b>'));
    check('both ok: raw message markup is not in the html', !mail.html.includes('a&b<c>'));
    check('both ok: stored email still omits language', !mail.html.includes('>Language</td>'));
    check('both ok: lead stored is logged', logged(out.logs, 'lead stored'));
    assertNoSecrets(out.res.body + '\n' + flat(out.logs) + '\n' + flat(out.errors), 'both ok response and logs');
  });

  console.log('\n--- 2. database fails or is unconfigured, email sends ---\n');
  await withEnv(bothKeys(), async () => {
    installFetch((url) => {
      if (url === SB_LEADS) return { ok: false, status: 503, text: 'paused ' + SECRET_DB };
      return { ok: true, status: 200, text: '' };
    });
    const out = await callHandler(HAND, nextIp());
    const seen = takeCalls();
    expectSuccess(out, 'db 503');
    check('db 503: insert was attempted', seen[0] && seen[0].url === SB_LEADS);
    check('db 503: rejected seats are not written', seen[0] && JSON.parse(seen[0].opts.body).seats === null && !seen[0].opts.body.includes('<script'));
    expectHandRecord(mailOf(seen[1]), 'db 503');
    check('db 503: owner notified without a row is logged', logged(out.logs, 'owner notified; lead was not stored'));
    assertNoSecrets(out.res.body + '\n' + flat(out.logs) + '\n' + flat(out.errors), 'db 503 response and logs');
    check('db 503: echoed service key is redacted in the log', flat(out.errors).includes('[redacted]'));
  });

  await withEnv(bothKeys(), async () => {
    installFetch((url) => {
      if (url === SB_LEADS) return { throw: 'supabase unreachable ' + SECRET_DB };
      return { ok: true, status: 200, text: '' };
    });
    const out = await callHandler(HAND, nextIp());
    const seen = takeCalls();
    expectSuccess(out, 'db unreachable');
    expectHandRecord(mailOf(seen[1]), 'db unreachable');
    check('db unreachable: network error is logged', logged(out.errors, 'network error storing lead'));
    assertNoSecrets(out.res.body + '\n' + flat(out.logs) + '\n' + flat(out.errors), 'db unreachable response and logs');
  });

  await withEnv({ RESEND_API_KEY: SECRET_MAIL }, async () => {
    installFetch((url) => {
      if (url === SB_LEADS) throw new Error('supabase called without a service key');
      return { ok: true, status: 200, text: '' };
    });
    const out = await callHandler(HAND, nextIp());
    const seen = takeCalls();
    expectSuccess(out, 'db unconfigured');
    check('db unconfigured: supabase is not called', seen.length === 1 && seen[0].url === RESEND, seen.map((c) => c.url));
    expectHandRecord(mailOf(seen[0]), 'db unconfigured');
    check('db unconfigured: missing key is logged', logged(out.errors, 'SUPABASE_SERVICE_ROLE_KEY not configured — cannot store lead'));
    assertNoSecrets(out.res.body + '\n' + flat(out.logs) + '\n' + flat(out.errors), 'db unconfigured response and logs');
  });

  console.log('\n--- 3. database stores, email fails ---\n');
  await withEnv(bothKeys(), async () => {
    installFetch((url) => {
      if (url === SB_LEADS) return { ok: true, status: 201, text: '' };
      return { ok: false, status: 500, text: 'mail down ' + SECRET_MAIL };
    });
    const out = await callHandler(FULL, nextIp());
    const seen = takeCalls();
    expectSuccess(out, 'email rejected');
    check('email rejected: failure is logged', logged(out.errors, 'lead notification failed'));
    check('email rejected: subject is the stored-lead subject', mailOf(seen[1]).subject === 'Enterprise enquiry: Northwind & Sons');
    check('email rejected: visitor body does not include the provider error', !out.res.body.includes('mail down'));
    assertNoSecrets(out.res.body + '\n' + flat(out.logs) + '\n' + flat(out.errors), 'email rejected response and logs');
    check('email rejected: echoed resend key is redacted in the log', flat(out.errors).includes('[redacted]'));
  });

  await withEnv(bothKeys(), async () => {
    installFetch((url) => {
      if (url === SB_LEADS) return { ok: true, status: 201, text: '' };
      return { throw: 'resend unreachable' };
    });
    const out = await callHandler(FULL, nextIp());
    takeCalls();
    expectSuccess(out, 'email threw');
    check('email threw: failure is logged', logged(out.errors, 'lead notification threw'));
  });

  await withEnv({ SUPABASE_SERVICE_ROLE_KEY: SECRET_DB }, async () => {
    installFetch((url) => {
      if (url === RESEND) throw new Error('resend called without a key');
      return { ok: true, status: 201, text: '' };
    });
    const out = await callHandler(FULL, nextIp());
    const seen = takeCalls();
    expectSuccess(out, 'email unconfigured');
    check('email unconfigured: only the database is called', seen.length === 1 && seen[0].url === SB_LEADS, seen.map((c) => c.url));
    check('email unconfigured: no notification error is logged', !logged(out.errors, 'lead notification failed') && !logged(out.errors, 'lead notification threw') && !logged(out.errors, 'RESEND_API_KEY not configured'));
  });

  console.log('\n--- 4. both channels fail ---\n');
  await withEnv(bothKeys(), async () => {
    installFetch((url) => {
      if (url === SB_LEADS) return { ok: false, status: 500, text: 'relation "leads" does not exist' };
      return { ok: false, status: 502, text: 'resend-down' };
    });
    const out = await callHandler(FULL, nextIp());
    const seen = takeCalls();
    expectHelloError(out, 'both rejected', 502);
    check('both rejected: both channels were attempted', seen.length === 2 && seen[0].url === SB_LEADS && seen[1].url === RESEND, seen.map((c) => c.url));
    check('both rejected: database detail is not in the response', !out.res.body.includes('relation "leads"'));
    check('both rejected: email detail is not in the response', !out.res.body.includes('resend-down'));
    assertNoSecrets(out.res.body + '\n' + flat(out.logs) + '\n' + flat(out.errors), 'both rejected response and logs');
  });

  await withEnv(bothKeys(), async () => {
    installFetch(() => ({ throw: 'offline' }));
    const out = await callHandler(FULL, nextIp());
    takeCalls();
    expectHelloError(out, 'both threw', 502);
    check('both threw: database error is logged', logged(out.errors, 'network error storing lead'));
    check('both threw: email error is logged', logged(out.errors, 'lead notification threw'));
  });

  await withEnv({ SUPABASE_SERVICE_ROLE_KEY: SECRET_DB }, async () => {
    installFetch((url) => {
      if (url === RESEND) throw new Error('resend called without a key');
      return { ok: false, status: 503, text: 'paused' };
    });
    const out = await callHandler(FULL, nextIp());
    const seen = takeCalls();
    expectHelloError(out, 'db down email unconfigured', 502);
    check('db down email unconfigured: supabase was attempted and resend was not', seen.length === 1 && seen[0].url === SB_LEADS, seen.map((c) => c.url));
    check('db down email unconfigured: missing mail key is logged', logged(out.errors, 'RESEND_API_KEY not configured — lead was not stored and owner was not notified'));
  });

  await withEnv({}, async () => {
    installFetch(() => { throw new Error('fetch should not run when both keys are missing'); });
    const out = await callHandler(FULL, nextIp());
    const seen = takeCalls();
    expectHelloError(out, 'both unconfigured', 500);
    check('both unconfigured: nothing is called', seen.length === 0, seen.map((c) => c.url));
    check('both unconfigured: response names the public inbox', out.parsed.error.includes('Lead capture is not configured'));
  });

  console.log('\n--- protections stay in front of either channel ---\n');
  await withEnv(bothKeys(), async () => {
    installFetch(() => { throw new Error('fetch should not run'); });
    const bad = await callHandler({ email: 'not-an-email', company: 'Acme' }, nextIp());
    check('invalid email is 400', bad.res.statusCode === 400 && bad.parsed.error.includes('valid work email'), bad.parsed);
    check('invalid email makes no outbound call', takeCalls().length === 0);

    const bot = await callHandler({ email: 'buyer@example.com', website: 'https://spam.example', company: 'Bot' }, nextIp());
    check('honeypot is accepted', bot.res.statusCode === 200 && bot.parsed.ok === true, bot.parsed);
    check('honeypot makes no outbound call', takeCalls().length === 0);

    const json = await handler({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': nextIp() }, body: '{' });
    check('invalid JSON is 400', json.statusCode === 400);
    check('invalid JSON makes no outbound call', takeCalls().length === 0);

    const get = await handler({ httpMethod: 'GET', headers: { 'x-nf-client-connection-ip': nextIp() }, body: '{}' });
    check('GET is 405', get.statusCode === 405);
    check('GET makes no outbound call', takeCalls().length === 0);

    installFetch(() => ({ ok: true, status: 201, text: '' }));
    const bounded = await callHandler({
      email: 'buyer@example.com',
      name: 'N'.repeat(300),
      company: 'C'.repeat(300),
      seats: '\'; drop table leads;--',
      deployment: 'flow-edge-live',
      timeline: 'yesterday',
      message: 'M'.repeat(4500),
      source: 's'.repeat(80),
      lang: 'fr',
    }, nextIp());
    const boundedCalls = takeCalls();
    const row = JSON.parse(boundedCalls[0].opts.body);
    check('bounds: name', row.name.length === 120, row.name.length);
    check('bounds: company', row.company.length === 160, row.company.length);
    check('bounds: message', row.message.length === 4000 && row.message === 'M'.repeat(4000));
    check('bounds: source', row.source.length === 60);
    check('allow-list: seats', row.seats === null);
    check('allow-list: deployment', row.deployment === null);
    check('allow-list: timeline', row.timeline === null);
    check('lang outside en/he becomes en', row.lang === 'en');
    check('bounded lead still succeeds', bounded.res.statusCode === 200 && bounded.parsed.ok === true, bounded.res);
    const boundedMail = mailOf(boundedCalls[1]).html;
    check('bounded email does not contain the rejected seats text', !boundedMail.includes('drop table'));
    check('bounded email escapes nothing it should not invent', !boundedMail.includes(SECRET_DB));

    calls.length = 0;
    installFetch(() => ({ ok: true, status: 200, text: '' }));
    const limitedIp = '198.51.100.10';
    let last;
    for (let i = 0; i < 5; i++) last = await callHandler(FULL, limitedIp);
    check('fifth request from one IP is still allowed', last.res.statusCode === 200, last.res);
    const after = calls.length;
    last = await callHandler(FULL, limitedIp);
    check('sixth request from one IP is rate limited', last.res.statusCode === 429, last.res);
    check('rate limited request makes no outbound call', calls.length === after, calls.length);
    takeCalls();
  });

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
