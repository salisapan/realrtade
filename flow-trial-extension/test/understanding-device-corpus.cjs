// Tier 1, the device model (M4): two readings that must agree, a per-language self-test, and Router v2 escalating when it does not answer.
// Run: node test/understanding-device-corpus.cjs
const { FlowUnderstandingDevice: D } = require('../core/understanding-device.js');
const { FlowUnderstandingRouter: R } = require('../core/understanding-router.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const today = '2026-10-07';
const NOW = Date.parse('2026-10-07T09:00:00Z');
const ON = { aiDeviceTier1: true };
const TEXT = 'Hi Sali,\nCould you send me the signed lease by Friday? We need it for the bank.\nDana';
const HE = 'היי סאלי,\nתוכלי לשלוח לי את החוזה החתום עד יום שלישי? הבנק מחכה.\nדנה';
const askEn = { intentions: [{ kind: 'ask_of_me', ask_span: 'Could you send me the signed lease by Friday?', evidence_span: 'We need it for the bank.', due_span: 'by Friday', confidence: 0.9 }] };
const askHe = { intentions: [{ kind: 'ask_of_me', ask_span: 'תוכלי לשלוח לי את החוזה החתום עד יום שלישי?', evidence_span: 'הבנק מחכה.', due_span: 'עד יום שלישי', confidence: 0.9 }] };
// A scripted session: answer(A or B) per prompt; records what it was asked.
function session(byVariant) {
  const s = { asked: [], prompt: async (text, schema) => { const v = /Read the message again/.test(text) ? 'B' : 'A'; s.asked.push({ v, schema, text }); const a = byVariant[v]; if (a instanceof Error) throw a; return typeof a === 'function' ? a(text) : JSON.stringify(a); } };
  return s;
}
const PASSED = { checkedAt: NOW, en: { ok: true }, he: { ok: true } };

(async () => {
  console.log('\n--- the off switch ---\n');
  check('switch off: no Tier 1 at all', D.tier1For({}, session({ A: askEn, B: askEn }), PASSED, { now: NOW }) === null);
  check('the switch is named and defaults off', D.SWITCH === 'aiDeviceTier1' && D.DEFAULTS.aiDeviceTier1 === false);

  console.log('\n--- two readings that must agree ---\n');
  {
    const s = session({ A: askEn, B: askEn });
    const r = await D.read(s, TEXT, { today });
    check('two agreeing readings: one answer, a reply step due Friday 9 October', r.agreed && r.proposal.step === 'draft' && r.proposal.due === '2026-10-09', r);
    check('it was asked twice, in two wordings, with the response schema', s.asked.length === 2 && s.asked[0].v === 'A' && s.asked[1].v === 'B' && s.asked[0].schema === D.SCHEMA);
    check('both wordings carry the one shared prompt and the message', s.asked.every((a) => a.text.indexOf('WORD FOR WORD') >= 0 && a.text.indexOf('signed lease') >= 0));
    const dis = await D.read(session({ A: askEn, B: { intentions: [] } }), TEXT, { today });
    check('a reading that says nothing while the other proposes: no answer', !dis.agreed && dis.why === 'disagree');
    const dd = await D.read(session({ A: askEn, B: { intentions: [Object.assign({}, askEn.intentions[0], { due_span: undefined, ask_span: 'Could you send me the signed lease' })] } }), TEXT, { today });
    check('the same step on a different date: no answer', !dd.agreed && dd.why === 'disagree', dd);
    const bad = await D.read(session({ A: 'not json', B: askEn }), TEXT, { today });
    check('an unreadable reading: no answer', !bad.agreed && bad.why === 'unreadable');
    const th = await D.read(session({ A: askEn, B: new Error('gpu lost') }), TEXT, { today });
    check('a session that throws: no answer, never a crash', !th.agreed && th.why === 'error');
    const both = await D.read(session({ A: { intentions: [] }, B: { intentions: [] } }), TEXT, { today });
    check('two readings that both stay silent agree on silence', both.agreed && both.proposal.step === 'SILENT');
    const ung = await D.read(session({ A: { intentions: [{ kind: 'ask_of_me', ask_span: 'wire the money now', evidence_span: 'urgent', confidence: 0.9 }] }, B: askEn }), TEXT, { today });
    check('an ungrounded claim is dropped before agreement is checked', !ung.agreed);
  }

  console.log('\n--- the self-test and its freshness ---\n');
  {
    const t1 = D.tier1For(ON, session({ A: askEn, B: askEn }), { checkedAt: NOW, en: { ok: true }, he: { ok: false } }, { now: NOW, today });
    check('a passed English test lets the device read English', (await t1(TEXT)) !== null);
    check('a failed Hebrew test sends Hebrew up (no device answer)', (await t1(HE)) === null);
    check('a test older than 30 days: no Tier 1', D.tier1For(ON, session({ A: askEn, B: askEn }), { checkedAt: NOW - 31 * 86400000, en: { ok: true }, he: { ok: true } }, { now: NOW }) === null);
    check('no language passed: no Tier 1 at all', D.tier1For(ON, session({ A: askEn, B: askEn }), { checkedAt: NOW, en: { ok: false }, he: { ok: false } }, { now: NOW }) === null);
    check('no test result: no Tier 1', D.tier1For(ON, session({ A: askEn, B: askEn }), null, { now: NOW }) === null);
    // The audit: 12 English asks the device gets right (and 2 silences), Hebrew where it proposes the wrong step.
    const audit = [];
    for (let i = 0; i < 12; i++) audit.push({ text: TEXT, gold: 'draft', today });
    audit.push({ text: 'Thanks, got it. Dana', gold: 'SILENT', today });
    for (let i = 0; i < 12; i++) audit.push({ text: HE, gold: 'task', today });
    const scripted = session({ A: (t) => JSON.stringify(/Thanks, got it/.test(t) ? { intentions: [] } : /[֐-׿]/.test(t) ? askHe : askEn), B: (t) => JSON.stringify(/Thanks, got it/.test(t) ? { intentions: [] } : /[֐-׿]/.test(t) ? askHe : askEn) });
    const st = await D.selfTest(scripted, audit, { now: NOW, today });
    check('self-test: English passes (12/12 right, the thanks stays silent)', st.en.ok === true && st.en.tp === 12 && st.en.fp === 0, st.en);
    check('self-test: Hebrew fails (it proposes a reply where the answer is a task)', st.he.ok === false && st.he.fp === 12, st.he);
    const few = await D.selfTest(scripted, audit.slice(0, 5), { now: NOW, today });
    check('fewer than 12 proposed positives proves nothing: it stays off', few.en.ok === false && few.en.tp === 5);
  }

  console.log('\n--- through Router v2: the device answers, or the cloud does ---\n');
  {
    const cloud = { calls: 0 };
    const tier2 = async () => { cloud.calls++; return { intentions: [{ kind: 'ask_of_me', ask_span: 'Could you send me the signed lease', evidence_span: 'We need it for the bank.', due_span: 'by [DATE_1]', confidence: 0.9 }] }; };
    const deps = (s, st) => ({ tier1: D.tier1For(ON, s, st || PASSED, { now: NOW, today }) || undefined, tier2, mask: () => ({ ok: true, text: 'Hi [NAME_1], could you send me the signed lease by [DATE_1]? We need it for the bank.', unmask: (x) => x.replace('[DATE_1]', 'Friday') }), gate: () => ({ pass: true }), veto: () => null });
    const input = { text: TEXT, today, direction: 'inbound', cloudConsent: true, tier0: { quiet: null, step: 'SILENT', possible: true } };
    const a = await R.route(input, deps(session({ A: askEn, B: askEn })), { aiPrimary: true });
    check('an agreeing device: Tier 1 answers and nothing leaves the device', a.tier === 1 && a.step === 'draft' && cloud.calls === 0, a);
    const b = await R.route(input, deps(session({ A: askEn, B: { intentions: [] } })), { aiPrimary: true });
    check('a device that disagrees with itself: the cloud is asked, masked', b.tier === 2 && b.step === 'draft' && cloud.calls === 1, b.trace);
    const before = cloud.calls;
    const c = await R.route(Object.assign({}, input, { text: HE }), deps(session({ A: askHe, B: askHe }), { checkedAt: NOW, en: { ok: true }, he: { ok: false } }), { aiPrimary: true });
    check('a language the device did not pass goes to the cloud', c.trace[0] === 'tier1:invalid' && cloud.calls === before + 1 && c.tier === 2, c.trace);
  }

  console.log('\n--- portability ---\n');
  const src = require('fs').readFileSync(require('path').join(__dirname, '../core/understanding-device.js'), 'utf8').replace(/\/\/.*$/gm, '');
  check('no chrome.*, document or window', !/\bchrome\.|\bdocument\.|\bwindow\./.test(src));
  check('no network', !/fetch\(|XMLHttpRequest|WebSocket/.test(src));

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
