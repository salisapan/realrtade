// End to end: a surface's mail -> core/ai-host.js -> the device mask -> the REAL glance-assist reader (understand.js, mock model,
// memory store) -> back on the device: floor, plan, carry -> and the loop closes on the person's real answer.
// No network: post() calls the server function in this process. Run: node test/ai-host-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'step-list.js', 'json-enforce.js',
  'understanding.js', 'request-types.js', 'reply-meaning.js', 'file-path.js', 'follow-up.js', 'model-plan.js', 'privacyShield.js', 'mask-ids.js', 'exec-router.js',
  'understanding-router.js', 'ai-floor.js', 'kind-check.js', 'tier0-guard.js', 'tier0-quiet.js', 'ai-engine.js', 'ai-host.js'];
const sb = { module: undefined, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Promise, TextEncoder, atob, btoa };
vm.createContext(sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const H = vm.runInContext('FlowAiHost', sb);
const SERVER = require('../../flow-landing/netlify/functions/glance-assist/understand.js');

const NOW = Date.parse('2026-10-07T09:00:00Z'); // a Wednesday
const ALL = { aiPrimary: true, aiPlanV1: true };
const ENV = { GLANCE_AI_PRIMARY: 'en,he', GLANCE_AI_SPEND_CAP_USD: '10' };

// A model that quotes the first question in the masked text, and the date words in it.
function modelAnswer(user) {
  const q = (String(user).match(/[^\n.?!]*\?/) || [null])[0];
  if (!q) return { intentions: [] };
  const due = (q.match(/\[DATE_\d+\]/) || q.match(/עד יום \S+/) || q.match(/by \w+/) || [undefined])[0];
  return { relevant: 'yes', state: 'open', needs: [], intentions: [{ kind: 'ask_of_me', actor: 'sender', ask_span: q.trim(), evidence_span: q.trim(), due_span: due, confidence: 0.9 }] };
}
function server(over) {
  const seen = [];
  const reader = SERVER.createUnderstand(Object.assign({ env: ENV, now: NOW, store: SERVER.memoryStore(),
    provider: async ({ user }) => { seen.push(user); return JSON.stringify(modelAnswer(user)); } }, over || {}));
  return { seen, post: async (payload) => { const r = await reader.read(payload); return { status: r.status, body: r.body }; } };
}
const mail = (text, over) => Object.assign({ text, subject: 'Lease', direction: 'inbound', surface: 'gmail', threadId: 't-1', messageId: 'm-1',
  from: { email: 'dana.cohen@acme.co.il', name: 'Dana Cohen' }, cloudConsent: true, now: NOW, today: '2026-10-07' }, over || {});
const SILENT = { show: false };
const EN = 'Hi Sali,\nCould you send me the signed lease by Friday? We need it for the bank.\nDana Cohen\ndana.cohen@acme.co.il';

(async () => {
  console.log('\n--- one mail, end to end ---\n');
  {
    const s = server();
    const out = await H.readMail(ALL, mail(EN), SILENT, { post: s.post, identity: { installId: 'install-abcdef12' } });
    check('the cloud was asked once', s.seen.length === 1, s.seen.length);
    check('...with masked text only: no name, no email, no date words', s.seen[0] && !/Dana|Sali|acme|@|Friday/.test(s.seen[0]), s.seen[0]);
    check('the card comes back as a reply, planned (Reply & Track), due Friday 9 October', out.card && out.card.source === 'model' && out.card.step === 'draft'
      && out.card.plan.processId === 'reply-track' && out.card.proposal.due === '2026-10-09', out.card && { step: out.card.step, plan: out.card.plan && out.card.plan.processId, due: out.card.proposal && out.card.proposal.due });
    check('the ask quoted back on the device is the real words, unmasked', out.card && /Friday/.test(out.card.proposal.askSpan) && !/\[DATE_/.test(out.card.proposal.askSpan), out.card && out.card.proposal.askSpan);
    check('...and it is carried: an ask of you, closing when your reply goes out', out.watch && out.watch.direction === 'mine' && out.watch.subtype === 'owe:reply' && out.watch.closeWhen === 'reply-sent', out.watch);
    check('nothing closes, writes or sends', out.card.proposal.closes === false && out.card.plan.closes === false && out.card.plan.steps.every((x) => x.needsClick));
    const w = out.watch;
    check('"Got it, thanks" does not close it', H.onMessage(ALL, w, { isOwn: true, text: 'Got it, thanks!' }, NOW).none === true);
    const c = H.onMessage(ALL, w, { isOwn: true, text: 'Hi Dana, here is the signed lease, see you Friday.' }, NOW);
    check('the person\'s real answer closes it', c.close === true && c.patch.closedAs === 'replied', c);
    check('a loop the engine opened is left to the surface\'s own rule', H.onMessage(ALL, Object.assign({}, w, { tier: 'rule' }), { isOwn: true, text: 'Thursday works' }, NOW).defer === true);
  }

  console.log('\n--- Hebrew ---\n');
  {
    const s = server();
    const out = await H.readMail(ALL, mail('היי סאלי,\nתוכלי לשלוח לי את החוזה החתום עד יום שלישי? הבנק מחכה.\nדנה', { subject: 'חוזה' }), SILENT, { post: s.post, identity: { installId: 'install-abcdef12' } });
    check('a Hebrew ask: a reply due Tuesday 13 October', out.card && out.card.step === 'draft' && out.card.proposal.due === '2026-10-13', out.card && out.card.proposal);
    check('...the name never left the device', s.seen[0] && !/סאלי/.test(s.seen[0]), s.seen[0]);
  }

  console.log('\n--- what the cloud never sees, and what stays silent ---\n');
  {
    const s = server();
    const out = await H.readMail(ALL, mail(EN + '\n054-1234567'), SILENT, { post: s.post, identity: { installId: 'install-abcdef12' } });
    check('an Israeli phone in the signature is masked: the cloud reads the mail without it', s.seen.length === 1 && !/054|1234567/.test(s.seen[0]) && /\[PHONE_\d+\]/.test(s.seen[0]) && out.card && out.card.step === 'draft', { seen: s.seen, reason: out.reason });
    const s2 = server();
    const bare = await H.readMail(ALL, mail(EN + '\n0541234567'), SILENT, { post: s2.post, identity: { installId: 'install-abcdef12' } });
    check('a bare unseparated Israeli number (the mask leaves bare 10-digit runs alone): the cloud is never asked', s2.seen.length === 0 && bare.card === null, { seen: s2.seen.length, reason: bare.reason });
    const direct = await s.post({ action: 'understand-read', maskedText: 'Could you call me at 054-1234567 [DATE_1]?', today: '2026-10-07', installId: 'install-abcdef12' });
    check('...and the server refuses it too, nothing charged', direct.status === 422 && direct.body.code === 'pii', direct);
  }
  {
    const s = server();
    const out = await H.readMail(ALL, mail(EN, { cloudConsent: false }), SILENT, { post: s.post, identity: { installId: 'install-abcdef12' } });
    check('no consent: the cloud is never asked', s.seen.length === 0 && out.card === null, out.reason);
    const quiet = await H.readMail(ALL, mail(EN), { show: false, quiet: 'newsletter' }, { post: s.post, identity: { installId: 'install-abcdef12' } });
    check('a hard quiet on the device: the cloud is never asked', s.seen.length === 0 && quiet.card === null);
    const own = await H.readMail(ALL, mail(EN), { show: true, step: 'draft' }, { post: s.post, identity: { installId: 'install-abcdef12' } });
    check('the device already has a card: it is returned untouched, no cloud call', own.card && own.card.source === 'engine' && s.seen.length === 0);
    const off = await H.readMail({}, mail(EN), SILENT, { post: s.post, identity: { installId: 'install-abcdef12' } });
    check('aiPrimary off: nothing runs at all', off.used === false && s.seen.length === 0);
  }

  console.log('\n--- the owner\'s spend cap ---\n');
  {
    const s = server({ env: Object.assign({}, ENV, { GLANCE_AI_SPEND_CAP_USD: '0.0005' }) }); // room for one read at the default $0.0004
    const state = {};
    let t = NOW;
    const opts = { post: s.post, identity: { installId: 'install-abcdef12' }, state, clock: () => t };
    const a = await H.readMail(ALL, mail(EN), SILENT, opts);
    const b = await H.readMail(ALL, mail(EN, { threadId: 't-2' }), SILENT, opts);
    check('the first read is served, the second hits the cap: silence, no crash', a.card && a.card.step === 'draft' && b.card === null && state.lastCode === 'spend_cap', { a: a.reason, b: b.reason, state });
    const asked = s.seen.length;
    const c = await H.readMail(ALL, mail(EN, { threadId: 't-3' }), SILENT, opts);
    check('after the cap the host does not ask again during the cool-down', c.card === null && s.seen.length === asked, s.seen.length);
    t += H.COOL_MS.spend_cap + 1;
    await H.readMail(ALL, mail(EN, { threadId: 't-4' }), SILENT, opts);
    check('...and asks again after it (the server still says no)', state.lastCode === 'spend_cap');
  }
  {
    const s = server({ env: { GLANCE_AI_SPEND_CAP_USD: '10' } }); // GLANCE_AI_PRIMARY unset: the server is off
    const out = await H.readMail(ALL, mail(EN), SILENT, { post: s.post, identity: { installId: 'install-abcdef12' } });
    check('the server switch off: no card, the device carries on', out.card === null && s.seen.length === 0);
    const broken = await H.readMail(ALL, mail(EN), SILENT, { post: async () => { throw new Error('offline'); }, identity: { installId: 'install-abcdef12' } });
    check('offline: no card, never a crash', broken.card === null);
  }

  console.log('\n--- portability ---\n');
  const src = fs.readFileSync(path.join(__dirname, '../core/ai-host.js'), 'utf8').replace(/\/\/.*$/gm, '');
  check('no chrome.*, document or window, no fetch of its own', !/\bchrome\.|\bdocument\.|\bwindow\.|fetch\(|XMLHttpRequest/.test(src));

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
