// "Waiting on" through the REAL content scripts, in a page that has Gmail's
// structural anchors (div[role=main] > div[role=listitem], [email] spans,
// data-legacy-* ids, "me" label). This does not prove Gmail's live markup — only
// a real Gmail can — but it does prove the wiring: the manifest's script order,
// the hook in scanReadingPane(), the card, the stored watch, the Task write and
// the settle-on-reply path, all running together.
//
// Needs Playwright with a Chromium (PW_CHROMIUM, default /opt/pw-browsers/chromium).
// Without it the file reports SKIPPED and exits 0.
// Run: node test/follow-gmail-harness.cjs
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright'))); } catch (e2) { console.log('SKIPPED: playwright not available'); process.exit(0); }
}
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
if (!fs.existsSync(EXE)) { console.log('SKIPPED: no chromium at ' + EXE); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const cs = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).content_scripts[0];
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'glance-follow-'));

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const mine = { from: 'me@x.com', fromName: 'Me', to: 'dana@acme.com', toIsMe: false };
const theirs = { from: 'dana@acme.com', fromName: 'Dana Cole', to: 'me@x.com', toIsMe: true };
const msg = (who, text) => Object.assign({ text }, who);

function html(thread) {
  const items = thread.map((m, i) => `
  <div role="listitem" data-legacy-thread-id="t1" data-legacy-message-id="m${i + 1}">
    <span email="${m.from}" name="${m.fromName}">${m.fromName}</span> <span email="${m.to}">${m.toIsMe ? 'me' : 'Dana Cole'}</span>
    <div class="a3s">${m.text}</div>
  </div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Inbox - me@x.com - Gmail</title>
${cs.css.map((c) => `<link rel="stylesheet" href="file://${ROOT}/${c}">`).join('\n')}
</head><body><h2 class="hP">Vendor booking</h2><div role="main">${items}</div></body></html>`;
}

function stub() {
  // Pin "now" to Thursday 1 Oct 2026, noon, so every date below is stable.
  const RealDate = Date;
  const fixed = new RealDate(2026, 9, 1, 12).getTime();
  class FixedDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  }
  window.Date = FixedDate;
  const store = { onboarded: true, connectorId: 'googleTasks' };
  window.__msgs = [];
  const reply = (m) => {
    window.__msgs.push(m);
    if (m.type === 'flow:pro-status') return { ok: true, active: !!window.__pro, record: window.__pro ? { key: 'k', valid: true, activeUntil: Date.now() + 1e9 } : null };
    if (m.type === 'flow:follow-task') return { ok: true, ref: { taskListId: 'L', taskId: 'T1' } };
    if (m.type === 'flow:connector-status') return { googleTasks: { connected: true, configured: true } };
    return { ok: true };
  };
  window.chrome = {
    runtime: { lastError: null, getURL: (s) => s, sendMessage: (m, cb) => { const r = reply(m); if (cb) setTimeout(() => cb(r), 0); }, onMessage: { addListener() {} } },
    storage: { local: {
      get: (k, cb) => { let r; if (k == null) r = { ...store }; else if (typeof k === 'string') r = { [k]: store[k] }; else if (Array.isArray(k)) r = Object.fromEntries(k.map((x) => [x, store[x]])); else r = { ...k, ...store }; if (cb) cb(r); return Promise.resolve(r); },
      set: (o, cb) => { Object.assign(store, o); if (cb) cb(); return Promise.resolve(); },
      remove: (k, cb) => { if (cb) cb(); return Promise.resolve(); }
    }, onChanged: { addListener() {} } },
    identity: {}, alarms: {}, tabs: {}
  };
  window.__store = store;
}

async function open(browser, name, thread, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.addInitScript(stub);
  if (opts.pro) await p.addInitScript(() => { window.__pro = true; });
  const file = path.join(TMP, name + '.html');
  fs.writeFileSync(file, html(thread));
  await p.goto('file://' + file);
  if (opts.watches) await p.evaluate((w) => { window.__store.followWatches = w; }, opts.watches);
  for (const src of cs.js) await p.addScriptTag({ path: path.join(ROOT, src) });
  await p.waitForTimeout(1000);
  const state = async () => ({
    errs,
    card: await p.evaluate(() => { const h = document.getElementById('flow-follow-host'); return h ? h.innerText.replace(/\n+/g, ' | ') : null; }),
    msgs: await p.evaluate(() => window.__msgs.map((m) => m.type)),
    watches: await p.evaluate(() => (window.__store.followWatches || []).map((w) => ({ id: w.id, status: w.status, chase: w.chaseIso, task: w.taskRef && w.taskRef.taskId, stage: w.stage, nudges: w.nudges, closedAs: w.closedAs, promised: w.promisedIso })))
  });
  return { p, ctx, state };
}

const baseWatch = { id: 't1', threadId: 't1', messageId: 'm1', subject: 'Vendor booking', counterpart: { email: 'dana@acme.com', name: 'Dana Cole' }, kind: 'reply', what: 'Please confirm the final figure by Monday', amount: null, deadlineIso: null, chaseIso: '2026-10-05', lang: 'en', createdAt: new Date(2026, 8, 28, 12).getTime(), status: 'waiting', taskRef: { taskListId: 'L', taskId: 'T9' }, nudges: 0 };
const W2 = Object.assign({}, baseWatch, { messageId: 'm2' });
const PAYW = Object.assign({}, baseWatch, { kind: 'payment', what: 'attached is invoice #3049 for $4,200, due next Monday', amount: { value: 4200, currency: 'USD', raw: '$4,200' }, chaseIso: '2026-10-13' });
const ASK = 'Please confirm the final figure by Monday so I can book the vendor.';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });

  // 1. my message asks for something -> one card; clicking writes a Task and stores a watch
  let t = await open(browser, 'offer', [msg(theirs, 'Can you send the numbers for the vendor?'), msg(mine, ASK)]);
  let s = await t.state();
  check('an ask in my own last message shows the card', /Waiting on a reply\?/.test(s.card || '') && /Stay on it/.test(s.card), s);
  check('the card says when it will remind me', /Mon, Oct 5/.test(s.card || ''), s.card);
  check('nothing is written until I click', !s.msgs.includes('flow:follow-task') && s.watches.length === 0, s);
  await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(400);
  s = await t.state();
  check('clicking writes the Task through the service worker', s.msgs.includes('flow:follow-task'), s.msgs);
  check('and stores a waiting watch with the task reference', s.watches.length === 1 && s.watches[0].status === 'waiting' && s.watches[0].task === 'T1' && s.watches[0].chase === '2026-10-05', s.watches);
  check('the receipt offers Undo', /I'm on this one now\. I will look again on Mon, Oct 5 and close it when Dana answers\./.test(s.card || '') && /Undo/.test(s.card || ''), s.card);
  await t.p.click('.flow-fu-btn.ghost'); await t.p.waitForTimeout(300);
  s = await t.state();
  check('Undo removes the Task and stops the watch', s.msgs.includes('flow:undo-action') && s.watches[0].status === 'stopped', s);
  check('no script errors', s.errs.length === 0, s.errs);
  await t.ctx.close();

  // 2. courtesy only -> silence
  t = await open(browser, 'quiet', [msg(theirs, 'Great call today.'), msg(mine, 'Thanks so much for the call. Let me know if you have any questions.')]);
  s = await t.state();
  check('a courtesy closer shows nothing and stores nothing', s.card === null && s.watches.length === 0 && !s.msgs.includes('flow:follow-task'), s);
  await t.ctx.close();

  // 3. Not now -> remembered, not asked again for that message
  t = await open(browser, 'decline', [msg(theirs, 'Can you send the numbers?'), msg(mine, ASK)]);
  await t.p.click('.flow-fu-btn.ghost'); await t.p.waitForTimeout(300);
  s = await t.state();
  check('Not now closes the card and records the decision', s.card === null && s.watches[0] && s.watches[0].status === 'stopped', s);
  await t.ctx.close();
  t = await open(browser, 'declined-before', [msg(theirs, 'Can you send the numbers?'), msg(mine, ASK)], { watches: [Object.assign({}, baseWatch, { messageId: 'm2', status: 'stopped' })] });
  s = await t.state();
  check('a message I already said "not now" to is not offered again', s.card === null, s);
  await t.ctx.close();

  // 4. they reply -> the reminder settles by itself
  t = await open(browser, 'settle', [msg(mine, ASK), msg(theirs, 'Confirmed, the figure is $4,200. Booking now.')], { watches: [baseWatch] });
  s = await t.state();
  check('a reply closes the watch', s.watches[0].status === 'resolved', s.watches);
  check('and completes the Task', s.msgs.includes('flow:follow-complete'), s.msgs);
  check('with a one-line receipt', /Dana replied after 3 days\. Loop closed\./.test(s.card || '') && /Reopen/.test(s.card || ''), s.card);
  await t.ctx.close();

  // 5. an out-of-office is not an answer
  t = await open(browser, 'ooo', [msg(mine, ASK), msg(theirs, 'I am out of the office until Oct 12 with limited access to email.')], { watches: [baseWatch] });
  s = await t.state();
  check('an out-of-office reply leaves the watch waiting', s.watches[0].status === 'waiting' && !s.msgs.includes('flow:follow-complete') && s.card === null, s);
  await t.ctx.close();

  // 6. the free cap
  const others = [1, 2, 3].map((i) => Object.assign({}, baseWatch, { id: 'x' + i, threadId: 'x' + i }));
  t = await open(browser, 'cap', [msg(theirs, 'Can you send the numbers?'), msg(mine, ASK)], { watches: others });
  s = await t.state();
  check('a free account at 3 follow-ups sees the Pro card, not another offer', /3 of 3 open loops/.test(s.card || '') && /See Glance Pro/.test(s.card || '') && !/Stay on it/.test(s.card || ''), s.card);
  await t.ctx.close();
  t = await open(browser, 'cap-pro', [msg(theirs, 'Can you send the numbers?'), msg(mine, ASK)], { watches: others, pro: true });
  s = await t.state();
  check('a Pro account at 3 follow-ups is offered the 4th', /Stay on it/.test(s.card || ''), s.card);
  await t.ctx.close();

  // 7. a payment is recognised and carries its amount
  t = await open(browser, 'pay', [msg(theirs, 'Please send the invoice.'), msg(mine, 'Hi, attached is invoice #3049 for $4,200, due next Monday. Please pay by then.')]);
  s = await t.state();
  check('an invoice you sent is offered as a payment to chase', /Waiting on a payment\?/.test(s.card || '') && /Tue, Oct 13/.test(s.card || ''), s.card);
  await t.ctx.close();


  // 8. the answer is only "got it": the loop stays open and nothing is shown
  t = await open(browser, 'ack', [msg(mine, ASK), msg(theirs, 'Got it, thanks!')], { watches: [baseWatch] });
  s = await t.state();
  check('"got it, thanks" leaves the loop open and says nothing', s.watches[0].status === 'waiting' && s.card === null && !s.msgs.includes('flow:follow-complete'), s);
  await t.ctx.close();

  // 9. a promise moves the day and keeps the loop open
  t = await open(browser, 'promise', [msg(mine, ASK), msg(theirs, "Thanks, I'll get back to you by Friday.")], { watches: [baseWatch] });
  s = await t.state();
  check('a promised day keeps the loop open and moves the chase to it', s.watches[0].status === 'waiting' && s.watches[0].stage === 'promised' && s.watches[0].chase === '2026-10-02' && s.watches[0].promised === '2026-10-02', s.watches);
  check('the reminder Task follows the new day', s.msgs.includes('flow:follow-reschedule') && !s.msgs.includes('flow:follow-complete'), s.msgs);
  check('and says so in one line', /Dana promised it for Fri, Oct 2\. I moved your reminder to Fri, Oct 2\./.test(s.card || ''), s.card);
  await t.ctx.close();

  // 10. a payment thread: a reply that never says it was paid asks once
  t = await open(browser, 'pay-answered', [msg(mine, 'Invoice attached.'), msg(theirs, 'I was told the invoice is with accounting, will check.')], { watches: [PAYW] });
  s = await t.state();
  check('a payment reply that never says "paid" asks, and keeps the loop open', s.watches[0].status === 'waiting' && /Dana replied\. Is it paid\?/.test(s.card || '') && /Mark paid/.test(s.card || '') && /Keep chasing/.test(s.card || ''), s);
  await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(400);
  s = await t.state();
  check('Mark paid closes it as paid and completes the Task', s.watches[0].status === 'resolved' && s.watches[0].closedAs === 'paid' && s.msgs.includes('flow:follow-complete'), s);
  check('and the receipt names the amount', /says it is paid \(\$4,200\) after 3 days\. Loop closed\./.test(s.card || ''), s.card);
  await t.ctx.close();

  // 11. a payment confirmation closes it by itself
  t = await open(browser, 'pay-paid', [msg(mine, 'Invoice attached.'), msg(theirs, 'Payment sent today, confirmation attached.')], { watches: [PAYW] });
  s = await t.state();
  check('"payment sent" closes a payment loop as paid', s.watches[0].status === 'resolved' && s.watches[0].closedAs === 'paid' && s.msgs.includes('flow:follow-complete'), s);
  await t.ctx.close();

  // 12. you chase: the next look moves out and the stage becomes "nudged"
  t = await open(browser, 'chase', [msg(theirs, 'Can you send the numbers?'), msg(mine, ASK), msg(mine, 'Hi Dana, just following up on the figure. Any update on your side?')], { watches: [W2] });
  s = await t.state();
  check('your own chase is recorded as a nudge and the chase day moves out', s.watches[0].status === 'waiting' && s.watches[0].stage === 'nudged' && s.watches[0].nudges === 1 && s.watches[0].chase === '2026-10-05', s.watches);
  check('the Task follows', s.msgs.includes('flow:follow-reschedule'), s.msgs);
  await t.ctx.close();
  t = await open(browser, 'talk', [msg(theirs, 'Can you send the numbers?'), msg(mine, ASK), msg(mine, 'Also, see you on Tuesday at the office for the walkthrough.')], { watches: [W2] });
  s = await t.state();
  check('an ordinary message of yours is not a chase', s.watches[0].nudges === 0 && (s.watches[0].stage || 'waiting') === 'waiting' && !s.msgs.includes('flow:follow-reschedule'), s.watches);
  await t.ctx.close();

  // 13. an answer followed by a "thanks" is still an answer
  t = await open(browser, 'answer-then-thanks', [msg(mine, ASK), msg(theirs, 'Confirmed, the figure is $4,200. Booking now.'), msg(theirs, 'Thanks!')], { watches: [baseWatch] });
  s = await t.state();
  check('an answer followed by a thank-you still closes the loop', s.watches[0].status === 'resolved' && s.watches[0].closedAs === 'replied', s.watches);
  await t.ctx.close();

  // 14. Reopen from the receipt
  t = await open(browser, 'reopen', [msg(mine, ASK), msg(theirs, 'Confirmed, the figure is $4,200. Booking now.')], { watches: [baseWatch] });
  await t.p.click('.flow-fu-btn.ghost'); await t.p.waitForTimeout(400);
  s = await t.state();
  check('Reopen puts the loop back on the list with a fresh chase day and reopens the Task', s.watches[0].status === 'waiting' && s.watches[0].closedAs === null && s.watches[0].chase === '2026-10-05' && s.msgs.includes('flow:follow-reopen'), s);
  check('and does not re-close itself on the same reply', s.watches[0].status === 'waiting', s.watches);
  await t.ctx.close();


  // 15. a typed ask the fixed phrasings do not cover (local lexicon)
  t = await open(browser, 'typed', [msg(theirs, 'Thanks for the call.'), msg(mine, 'Hi Dana, could you please sign the NDA by Friday? We would like to start on Monday.')]);
  s = await t.state();
  check('a request recognised by the local lexicon is offered', /Waiting on a reply\?/.test(s.card || '') && /Stay on it/.test(s.card || ''), s.card);
  await t.ctx.close();

  // 16. a promise of mine is a loop too
  t = await open(browser, 'promise-out', [msg(theirs, 'Can we talk numbers soon?'), msg(mine, "Sure. I'll send you the revised numbers by Friday.")]);
  s = await t.state();
  check('my own promise is offered, worded as a promise', /You promised something/.test(s.card || '') && /Remind me/.test(s.card || '') && /Fri, Oct 2/.test(s.card || ''), s.card);
  await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(400);
  s = await t.state();
  check('accepting stores a loop that is mine, with a Task', s.msgs.includes('flow:follow-task') && s.watches[0].status === 'waiting', s);
  check('and the receipt says it will close when I send it', /I will close it when you send it/.test(s.card || ''), s.card);
  await t.ctx.close();
  const MINEW = Object.assign({}, baseWatch, { direction: 'mine', messageId: 'm2', what: "I'll send you the revised numbers by Friday." });
  t = await open(browser, 'promise-kept', [msg(theirs, 'Can we talk numbers soon?'), msg(mine, "Sure. I'll send you the revised numbers by Friday."), msg(mine, 'Hi Dana, attached are the revised numbers.')], { watches: [MINEW] });
  s = await t.state();
  check('sending it closes the promise as kept', s.watches[0].status === 'resolved' && s.watches[0].closedAs === 'kept' && s.msgs.includes('flow:follow-complete') && /Promise kept after 3 days\. Loop closed\./.test(s.card || ''), { w: s.watches, card: s.card });
  await t.ctx.close();
  t = await open(browser, 'promise-reply', [msg(theirs, 'Can we talk numbers soon?'), msg(mine, "Sure. I'll send you the revised numbers by Friday."), msg(theirs, 'Great, thanks, no rush.')], { watches: [MINEW] });
  s = await t.state();
  check('their reply does not close my promise', s.watches[0].status === 'waiting' && s.card === null, s);
  await t.ctx.close();
  t = await open(browser, 'promise-more', [msg(theirs, 'Can we talk numbers soon?'), msg(mine, "Sure. I'll send you the revised numbers by Friday."), msg(mine, 'Still working on it, will send tomorrow.')], { watches: [MINEW] });
  s = await t.state();
  check('another promise is not delivery', s.watches[0].status === 'waiting', s.watches);
  await t.ctx.close();

  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})();
