// Every intention the model found (core/model-multi.js, aiMultiV1): each one on its own, through the floor, planned and carried.
// The measured set below is hand-written two-intention mails (EN + HE) with a scripted model that names both intentions. It measures the
// engine's plumbing (does it keep, gate and plan both?), not a model: the lab has no real multi-intention mail.
// Run: node test/model-multi-corpus.cjs
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
  'kind-check.js', 'model-multi.js', 'understanding-router.js', 'ai-floor.js', 'tier0-guard.js', 'tier0-quiet.js', 'cloud-worth.js', 'ai-engine.js'];
const sb = { module: undefined, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Promise, TextEncoder, atob, btoa };
vm.createContext(sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const E = vm.runInContext('FlowAiEngine', sb), MM = vm.runInContext('FlowModelMulti', sb), U = vm.runInContext('FlowUnderstanding', sb);
const NOW = Date.parse('2026-10-07T09:00:00'); // a Wednesday
const OFF = { aiPrimary: true, aiPlanV1: true };
const ON = { aiPrimary: true, aiPlanV1: true, aiMultiV1: true };
const it = (kind, span, due, confidence) => ({ kind, actor: 'sender', ask_span: span, evidence_span: span, due_span: due, confidence: confidence || 0.9 });
const read = (text, answer, flags) => E.read({ text, subject: 'x', today: '2026-10-07', direction: 'inbound', surface: 'gmail', lang: /[֐-׿]/.test(text) ? 'he' : 'en',
  threadId: 't-1', counterpart: { name: 'Dana' }, now: NOW, tier0: { quiet: null, step: 'SILENT', possible: true } }, { tier1: async () => answer }, flags);
const steps = (out) => (out.cards || (out.card ? [out.card] : [])).map((c) => c.step).sort().join('+');

// Hand-written two-intention mails; gold = the steps of both intentions.
const SET = [
  { text: 'Could you send me the signed contract by Friday? Also, can we meet on Thursday at 10:00 at the office?', gold: 'calendar+draft',
    a: [it('ask_of_me', 'Could you send me the signed contract by Friday?', 'by Friday'), it('meeting', 'can we meet on Thursday at 10:00 at the office?', 'on Thursday at 10:00')] },
  { text: 'I will send you the deck on Monday. Could you review the budget by Friday?', gold: 'draft+task',
    a: [it('promise_to_me', 'I will send you the deck on Monday.', 'on Monday'), it('ask_of_me', 'Could you review the budget by Friday?', 'by Friday')] },
  { text: 'Can we talk on Tuesday at 14:00? And please confirm the address by Monday.', gold: 'calendar+draft',
    a: [it('meeting', 'Can we talk on Tuesday at 14:00?', 'on Tuesday at 14:00'), it('ask_of_me', 'please confirm the address by Monday.', 'by Monday')] },
  { text: 'תוכלי לשלוח לי את החוזה החתום עד יום שישי? וגם, נפגש ביום חמישי ב-10:00 במשרד?', gold: 'calendar+draft',
    a: [it('ask_of_me', 'תוכלי לשלוח לי את החוזה החתום עד יום שישי?', 'עד יום שישי'), it('meeting', 'נפגש ביום חמישי ב-10:00 במשרד?', 'ביום חמישי ב-10:00')] },
  { text: 'אשלח לך את המצגת ביום שני. תוכלי לבדוק את התקציב עד יום שישי?', gold: 'draft+task',
    a: [it('promise_to_me', 'אשלח לך את המצגת ביום שני.', 'ביום שני'), it('ask_of_me', 'תוכלי לבדוק את התקציב עד יום שישי?', 'עד יום שישי')] },
  { text: 'Could you send the report by Friday? Could you also send the invoice by Friday?', gold: 'draft+draft',
    a: [it('ask_of_me', 'Could you send the report by Friday?', 'by Friday'), it('ask_of_me', 'Could you also send the invoice by Friday?', 'by Friday', 0.8)] }
];

(async () => {
  console.log('\n--- the measured set: intentions kept, switch off vs on ---\n');
  let goldN = 0, before = 0, after = 0, extra = 0, wrongBefore = 0;
  for (const c of SET) {
    const g = c.gold.split('+'); goldN += g.length;
    const off = await read(c.text, { intentions: c.a }, OFF), on = await read(c.text, { intentions: c.a }, ON);
    const so = steps(off).split('+').filter(Boolean), sn = steps(on).split('+').filter(Boolean);
    const hit = (arr) => { const left = g.slice(); let n = 0; for (const s of arr) { const i = left.indexOf(s); if (i >= 0) { left.splice(i, 1); n++; } } return n; };
    before += hit(so); after += hit(sn); extra += Math.max(0, sn.length - hit(sn)); wrongBefore += Math.max(0, so.length - hit(so));
    check('"' + c.text.slice(0, 50) + '…": both intentions with the switch on', steps(on) === c.gold, { off: steps(off), on: steps(on), reason: on.reason });
  }
  console.log(`  intentions kept: switch off ${before}/${goldN}, switch on ${after}/${goldN}; steps offered that the mail does not carry: off ${wrongBefore}, on ${extra}`);
  check('the switch keeps more intentions and offers nothing extra', after > before && extra === 0, { before, after, extra });

  console.log('\n--- each card is planned and carried on its own ---\n');
  {
    const c = SET[0];
    const on = await read(c.text, { intentions: c.a }, ON);
    check('two cards, each with its own plan', on.cards && on.cards.length === 2 && on.cards.every((x) => x.plan && x.plan.closes === false && x.plan.steps.every((s) => s.needsClick)));
    check('the reply is carried; the meeting closes on the calendar (no watch)', on.watches && on.watches.length === 1 && on.watches[0].direction === 'mine', on.watches);
    const two = await read(SET[5].text, { intentions: SET[5].a }, ON);
    check('two loops in one thread get two keys', two.watches && two.watches.length === 2 && two.watches[0].id !== two.watches[1].id, two.watches && two.watches.map((w) => w.id));
  }

  console.log('\n--- the floor runs on each one ---\n');
  {
    const text = 'Could you send me the signed contract by Friday? Also, could you pay the deposit by Monday?';
    const out = await read(text, { intentions: [it('ask_of_me', 'Could you send me the signed contract by Friday?', 'by Friday'), it('ask_of_me', 'could you pay the deposit by Monday?', 'by Monday')] }, ON);
    check('money anywhere in the mail: the floor silences every card (as for one)', out.card === null && /money/.test(out.reason), out.reason);
    const und = 'Could you send me the signed contract by Friday? Also, can you have a look at the deck sometime?';
    const u2 = await read(und, { intentions: [it('ask_of_me', 'Could you send me the signed contract by Friday?', 'by Friday'), it('ask_of_me', 'can you have a look at the deck sometime?')] }, ON);
    check('an undated second ask is dropped, the dated one stays', u2.card && u2.card.step === 'draft' && !u2.cards, { cards: u2.cards && u2.cards.length, reason: u2.reason });
    const ung = await read(SET[0].text, { intentions: [SET[0].a[0], it('meeting', 'we meet on Sunday at 9:00 at the bank', 'on Sunday at 9:00')] }, ON);
    check('an intention whose quote is not in the mail is thrown away; the real one stays', ung.card && ung.card.step === 'draft' && !ung.cards, steps(ung));
  }

  console.log('\n--- what does not change ---\n');
  {
    const off = await read(SET[0].text, { intentions: SET[0].a }, OFF);
    check('switch off: two different steps stay silent, as today', off.card === null && /two-intentions/.test(off.reason), off.reason);
    const one = await read('Could you send me the signed lease by Friday?', { intentions: [it('ask_of_me', 'Could you send me the signed lease by Friday?', 'by Friday')] }, ON);
    check('one intention: one card, no cards list', one.card && one.card.step === 'draft' && !one.cards);
    const done = await read(SET[0].text, { state: 'answered', intentions: SET[0].a }, ON);
    check('a mail the model calls answered: nothing', done.card === null);
    check('at most three', MM.proposals((u) => U.proposal(u, {}), { relevant: 'unknown', state: 'open', needs: [], intentions: [1, 2, 3, 4].map((n) => Object.assign(it('ask_of_me', 'ask ' + n), { due: '2026-10-0' + (n + 7) })) }, {}).length === 3);
    check('the switch is named and off by default', MM.SWITCH === 'aiMultiV1' && MM.DEFAULTS.aiMultiV1 === false && !MM.enabled({}));
  }

  console.log('\n--- portability ---\n');
  const src = fs.readFileSync(path.join(__dirname, '../core/model-multi.js'), 'utf8').replace(/\/\/.*$/gm, '');
  check('no chrome.*, document or window, no network', !/\bchrome\.|\bdocument\.|\bwindow\.|fetch\(|XMLHttpRequest/.test(src));

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
