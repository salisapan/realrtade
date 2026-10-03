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
const msg = (who, text, att) => Object.assign({ text, att: att || [] }, who);

function html(thread) {
  const items = thread.map((m, i) => `
  <div role="listitem" data-legacy-thread-id="t1" data-legacy-message-id="m${i + 1}">
    <span email="${m.from}" name="${m.fromName}">${m.fromName}</span> <span email="${m.to}">${m.toIsMe ? 'me' : 'Dana Cole'}</span>
    <div class="a3s">${m.text}</div>
    ${(m.att || []).map((a) => `<span download_url="application/pdf:${a}:https://mail.google.com/mail/u/0?ui=2&attid=${a}">${a}</span>`).join('')}
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
    if (m.type === 'flow:search-drive') return { ok: true, files: window.__driveFiles || [] };
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
  // A Gmail attachment's bytes (the content script fetches them with the page's cookies).
  window.fetch = async () => ({ ok: true, headers: { get: () => '4' }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer });
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
  if (opts.drive) await p.addInitScript((files) => { window.__driveFiles = files; }, opts.drive);
  const file = path.join(TMP, name + '.html');
  fs.writeFileSync(file, html(thread));
  await p.goto('file://' + file);
  if (opts.watches) await p.evaluate((w) => { window.__store.followWatches = w; }, opts.watches);
  if (opts.store) await p.evaluate((st) => { Object.assign(window.__store, st); }, opts.store);
  for (const src of cs.js) await p.addScriptTag({ path: path.join(ROOT, src) });
  await p.waitForTimeout(1000);
  const state = async () => ({
    errs,
    card: await p.evaluate(() => { const h = document.getElementById('flow-follow-host'); return h ? h.innerText.replace(/\n+/g, ' | ') : null; }),
    msgs: await p.evaluate(() => window.__msgs.map((m) => m.type)),
    watches: await p.evaluate(() => (window.__store.followWatches || []).map((w) => ({ id: w.id, status: w.status, chase: w.chaseIso, task: w.taskRef && w.taskRef.taskId, stage: w.stage, nudges: w.nudges, closedAs: w.closedAs, promised: w.promisedIso, file: w.file && w.file.object, preparedAt: w.preparedAt, preparedFile: w.preparedFile, fileChoice: w.fileChoice, resolution: w.resolution, direction: w.direction, resolvedBy: w.resolvedBy })))
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


  // 17. a date that runs out
  t = await open(browser, 'clock', [msg(mine, 'Could you send me the quote for the new scope?'), msg(theirs, 'Hi, here is the quote. It is valid until October 20, 2026, so please let us know before then.')]);
  s = await t.state();
  check('a stated expiry is offered with the day to look again', /This offer ends Tue, Oct 20/.test(s.card || '') && /Sat, Oct 17/.test(s.card || '') && /Remind me/.test(s.card || ''), s.card);
  await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(400);
  s = await t.state();
  check('accepting makes a clock loop with a Task', s.msgs.includes('flow:follow-task') && s.watches.some((w) => w.id === 'clock:t1' && w.status === 'waiting' && w.chase === '2026-10-17'), s);
  await t.ctx.close();
  t = await open(browser, 'clock-promo', [msg(mine, 'Hi there, any news?'), msg(theirs, 'Flash sale! 40% off everything. Offer ends October 20, 2026, shop now before it is gone.')]);
  s = await t.state();
  check('marketing mail with an end date is ignored', s.card === null && s.watches.length === 0, s);
  await t.ctx.close();
  t = await open(browser, 'clock-noreply', [msg(mine, 'Hi there, any news?'), msg({ from: 'noreply@acme.com', fromName: 'Acme', to: 'me@x.com', toIsMe: true }, 'Your subscription renews on November 12, 2026 at the current rate.')]);
  s = await t.state();
  check('a no-reply sender never gets a card', s.card === null && s.watches.length === 0, s);
  await t.ctx.close();
  t = await open(browser, 'clock-seen', [msg(mine, 'Could you send me the quote?'), msg(theirs, 'Here it is. It is valid until October 20, 2026, so please decide.')], { watches: [Object.assign({}, baseWatch, { id: 'clock:t1', direction: 'clock', expiresIso: '2026-10-20', status: 'waiting', chaseIso: '2026-10-17' })] });
  s = await t.state();
  check('an expiry already tracked for that date is not offered again', s.card === null, s.card);
  await t.ctx.close();


  // 18. the on-device model finds an ask no word list has a frame for, and learns from a refusal
  t = await open(browser, 'model-ask', [msg(theirs, 'Thanks for the draft.'), msg(mine, 'Hi Dana, do you mind taking another pass at the clause on indemnity before Friday? Legal wants it tight.')]);
  s = await t.state();
  check('a polite ask outside every listed frame is still offered (local model)', /Waiting on a reply\?/.test(s.card || '') && /Stay on it/.test(s.card || ''), s.card);
  await t.p.click('.flow-fu-btn.ghost'); await t.p.waitForTimeout(600);
  const adapt = await t.p.evaluate(() => window.__store.intentAdapt);
  check('turning a card down teaches the model a little: only feature numbers are stored, never the sentence', adapt && Object.keys(adapt.act || {}).length > 0 && !/indemnity|clause/i.test(JSON.stringify(adapt)), adapt && Object.keys(adapt.act || {}).length);
  await t.ctx.close();
  t = await open(browser, 'model-quiet', [msg(theirs, 'Great call today.'), msg(mine, 'Please find attached the signed agreement for your records. Have a great weekend and talk soon.')]);
  s = await t.state();
  check('boilerplate that borrows a request\'s words stays silent', s.card === null && s.watches.length === 0, s);
  await t.ctx.close();

  // 19. they wrote back, but the ball is mine: the chase stops, the reminder is for me
  const ASKTHREAD = [msg(theirs, 'Can you send the numbers for the vendor?'), msg(mine, ASK)];
  t = await open(browser, 'yours-q', ASKTHREAD.concat([msg(theirs, 'Which vendor do you mean? We have two.')]), { watches: [W2] });
  s = await t.state();
  check('a question back does not close the loop: it becomes mine', s.watches[0].status === 'waiting' && s.watches[0].stage === 'yours' && s.watches[0].closedAs == null, s.watches);
  check('the reminder moves to the next business day, for me', s.watches[0].chase === '2026-10-02', s.watches[0]);
  check('the Task is retitled so it says what to do', await t.p.evaluate(() => window.__msgs.some((m) => m.type === 'flow:follow-reschedule' && /^Answer Dana/.test(m.title || ''))), await t.p.evaluate(() => window.__msgs.filter((m) => m.type === 'flow:follow-reschedule')));
  check('the receipt says it is mine now', /asked you something/.test(s.card || '') && /yours now/.test(s.card || ''), s.card);
  check('no script errors', s.errs.length === 0, s.errs);
  await t.ctx.close();

  t = await open(browser, 'yours-blocked', ASKTHREAD.concat([msg(theirs, 'I never got the attachment, can you resend?')]), { watches: [W2] });
  s = await t.state();
  check('"I never got the attachment" keeps the loop open as mine', s.watches[0].status === 'waiting' && s.watches[0].stage === 'yours', s.watches);
  check('and says they could not open it', /could not open or find what you sent/.test(s.card || ''), s.card);
  await t.ctx.close();

  // 20. I answer: the ball goes back and the chase restarts
  t = await open(browser, 'handback', ASKTHREAD.concat([msg(theirs, 'Which vendor do you mean? We have two.'), msg(mine, 'Acme Catering, the quote is in the thread above.')]), { watches: [Object.assign({}, W2, { messageId: 'm3', stage: 'yours', yoursReason: 'question', chaseIso: '2026-10-02' })] });
  s = await t.state();
  check('answering hands the ball back to waiting', s.watches[0].status === 'waiting' && s.watches[0].stage === 'waiting' && s.watches[0].chase > '2026-10-02', s.watches);
  check('and says I am back on it', /back on it/.test(s.card || ''), s.card);
  await t.ctx.close();

  // 21. a plain no is an answer: closed, recorded as declined
  t = await open(browser, 'declined-reply', ASKTHREAD.concat([msg(theirs, 'Unfortunately we decided not to go ahead with the vendor.')]), { watches: [W2] });
  s = await t.state();
  check('a "no" closes the loop as declined', s.watches[0].status === 'resolved' && s.watches[0].closedAs === 'declined', s.watches);
  check('and the receipt says so plainly', /said no/.test(s.card || '') && /Reopen/.test(s.card || ''), s.card);
  await t.ctx.close();

  // 22. one story, many threads
  const KIN = Object.assign({}, baseWatch, { id: 'tX', threadId: 'tX', messageId: 'mX' });
  t = await open(browser, 'story-reply', [msg(theirs, 'Confirmed, the final figure is 4,200 and the vendor is booked.')], { watches: [KIN] });
  s = await t.state();
  check('an answer in a new thread settles the loop opened in another', s.watches.find((w) => w.id === 'tX').status === 'resolved', s.watches);
  await t.ctx.close();
  t = await open(browser, 'story-dup', [msg(mine, ASK)], { watches: [KIN] });
  s = await t.state();
  check('asking again about the same story never opens a second loop', s.card === null && s.watches.length === 1, s);
  await t.ctx.close();

  // 23. a two-word chase is a real ask
  t = await open(browser, 'short', [msg(theirs, 'Sent the draft on Monday.'), msg(mine, 'Any update?')]);
  s = await t.state();
  check('"Any update?" opens the same one-card offer', /Waiting on a reply\?/.test(s.card || '') && /Stay on it/.test(s.card || ''), s.card);
  const rs = await t.p.evaluate(() => window.__store.recognitionStats);
  check('and the decision is counted as a local hit, with no text stored', rs && rs.localHit >= 1 && !/update|Monday|draft/i.test(JSON.stringify(rs)), rs);
  await t.ctx.close();
  t = await open(browser, 'short-quiet', [msg(theirs, 'See you soon.'), msg(mine, 'Thanks!')]);
  s = await t.state();
  check('a one-word thanks stays silent', s.card === null && s.watches.length === 0, s);
  const rs2 = await t.p.evaluate(() => window.__store.recognitionStats);
  check('and is counted as local silence, not remote', rs2 && rs2.localSilence >= 1 && rs2.remote === 0, rs2);
  await t.ctx.close();

  // 24. completion you can feel: the ball comes back and the first draft is already waiting
  t = await open(browser, 'prepare-reply', ASKTHREAD.concat([msg(theirs, 'Which vendor do you mean? We have two.')]), { watches: [W2] });
  s = await t.state();
  check('when the ball comes back, the receipt offers to prepare my reply', /Prepare my reply/.test(s.card || ''), s.card);
  await t.p.click('.flow-fu-btn.ghost'); await t.p.waitForTimeout(400);
  s = await t.state();
  const draftMsg = await t.p.evaluate(() => window.__msgs.find((m) => m.type === 'flow:follow-draft'));
  check('it writes a Gmail draft to the right person with their question quoted', draftMsg && draftMsg.payload.to === 'dana@acme.com' && /Which vendor do you mean\?/.test(draftMsg.payload.body) && /\[Your answer here\]/.test(draftMsg.payload.body), draftMsg);
  check('and says plainly that nothing was sent', /Draft ready in Gmail\. Nothing was sent\./.test(s.card || ''), s.card);
  check('no send message was ever issued', !s.msgs.some((m) => /send(?!.*draft)/i.test(m) && m !== 'flow:follow-draft'), s.msgs);
  await t.ctx.close();

  // 25. knowing when not to start
  t = await open(browser, 'soft-ask', [msg(theirs, 'Thanks for the call.'), msg(mine, 'Thanks for the chat earlier. Let me know what you think when you get a moment.')]);
  s = await t.state();
  check('a soft "let me know what you think" opens nothing and costs no Free slot', s.card === null && s.watches.length === 0, s);
  await t.ctx.close();

  // 26. files: only when a file is part of finishing the intention
  const CFILE = { object: 'contract', label: 'contract', lang: 'en', synonym: ['contract', 'agreement', 'nda', 'חוזה', 'הסכם'] };
  const ASKC = 'Please send me the signed contract by Friday.';
  t = await open(browser, 'file-offer', [msg(theirs, 'Happy to proceed.'), msg(mine, ASKC)]);
  s = await t.state();
  check('an ask that a file finishes says so on the card', /Waiting on the contract\?/.test(s.card || '') && /the contract arrives/.test(s.card || ''), s.card);
  await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(400);
  s = await t.state();
  check('the loop remembers it is file-backed and says what closes it', s.watches[0].file === 'contract', s.watches);
  check('the receipt says it closes when the contract arrives', /close it when the contract arrives\./.test(s.card || ''), s.card);
  await t.ctx.close();

  const WC = Object.assign({}, W2, { what: ASKC, file: CFILE });
  const CT = [msg(theirs, 'Happy to proceed.'), msg(mine, ASKC)];
  t = await open(browser, 'file-close', CT.concat([msg(theirs, 'Here you go', ['IMG_2231.pdf'])]), { watches: [WC] });
  s = await t.state();
  check('a real attachment from them closes a file-backed loop', s.watches[0].status === 'resolved' && s.watches[0].closedAs === 'delivered', s.watches);
  check('and the receipt names what arrived', /sent the contract \(IMG_2231\.pdf\)/.test(s.card || '') && /Reopen/.test(s.card || ''), s.card);
  await t.ctx.close();

  t = await open(browser, 'file-claim', CT.concat([msg(theirs, 'Signed copy attached.')]), { watches: [WC] });
  s = await t.state();
  check('"attached" with no file does NOT close it', s.watches[0].status === 'waiting', s.watches);
  check('and it says no file came through', /no file came through/.test(s.card || ''), s.card);
  await t.ctx.close();

  t = await open(browser, 'file-none-needed', ASKTHREAD.concat([msg(theirs, 'Confirmed, the final figure is 4,200.', ['IMG_9.pdf'])]), { watches: [W2] });
  s = await t.state();
  check('a loop that is not file-backed ignores attachments and closes on the answer as before', s.watches[0].status === 'resolved' && s.watches[0].closedAs === 'replied', s.watches);
  await t.ctx.close();

  // 27. could not open it: resend the file I actually sent, only if it is one file
  const SENT = [msg(theirs, 'Please send the draft contract.'), msg(mine, 'Here is the contract. Please confirm the final figure by Monday.', ['contract.pdf'])];
  t = await open(browser, 'resend-file', SENT.concat([msg(theirs, 'I never got the attachment')]), { watches: [W2] });
  s = await t.state();
  check('the receipt offers the reply WITH the file I sent', /Prepare reply with file/.test(s.card || '') && /File ready: contract\.pdf/.test(s.card || ''), s.card);
  await t.p.click('.flow-fu-btn.ghost'); await t.p.waitForTimeout(500);
  s = await t.state();
  const dm = await t.p.evaluate(() => window.__msgs.find((m) => m.type === 'flow:follow-draft'));
  check('the draft carries that file and says so', dm && dm.payload.attachment && dm.payload.attachment.filename === 'contract.pdf' && dm.payload.attachment.base64 && /Attached: contract\.pdf/.test(dm.payload.body), dm && { att: !!dm.payload.attachment, body: dm.payload.body });
  check('nothing is sent and the receipt says so', /Draft ready in Gmail with contract\.pdf\. Nothing was sent\./.test(s.card || ''), s.card);
  check('preparing is NOT closing: the loop is still yours, now with a draft ready', s.watches[0].status === 'waiting' && s.watches[0].stage === 'yours' && s.watches[0].preparedFile === 'contract.pdf' && s.watches[0].preparedAt, s.watches);
  await t.ctx.close();

  t = await open(browser, 'resend-two', [msg(theirs, 'Send the drafts'), msg(mine, 'Here are both. Please confirm the final figure by Monday.', ['a.pdf', 'b.pdf']), msg(theirs, 'I never got the attachment')], { watches: [Object.assign({}, W2, { messageId: 'm2' })] });
  s = await t.state();
  check('two attachments is ambiguous: no file, the plain draft button', /Prepare my reply/.test(s.card || '') && !/File ready/.test(s.card || ''), s.card);
  await t.ctx.close();

  // 28. they ask me for a file: the one right Drive file, or none
  const RQ = [msg(mine, ASK), msg(theirs, 'Can you send me the receipt for the hotel?')];
  const W1 = Object.assign({}, W2, { messageId: 'm1' });
  t = await open(browser, 'ask-drive-one', RQ, { watches: [W1], drive: [{ id: 'F1', name: 'Receipt - Oct.pdf', mimeType: 'application/pdf' }, { id: 'F9', name: 'Budget.xlsx', mimeType: 'application/vnd.ms-excel' }] });
  s = await t.state();
  check('one confident Drive file: the receipt names it', /Prepare reply with file/.test(s.card || '') && /File ready: Receipt - Oct\.pdf/.test(s.card || ''), s.card);
  await t.p.click('.flow-fu-btn.ghost'); await t.p.waitForTimeout(500);
  const dd = await t.p.evaluate(() => window.__msgs.find((m) => m.type === 'flow:follow-draft'));
  s = await t.state();
  check('the draft is told to attach exactly that Drive file', dd && dd.payload.driveFileId === 'F1' && /Attached: Receipt - Oct\.pdf/.test(dd.payload.body), dd && dd.payload);
  check('the loop stays yours (preparing is intermediate)', s.watches[0].status === 'waiting' && s.watches[0].stage === 'yours' && s.watches[0].preparedFile === 'Receipt - Oct.pdf', s.watches);
  await t.ctx.close();
  t = await open(browser, 'ask-drive-two', RQ, { watches: [W1], drive: [{ id: 'F1', name: 'Receipt - Oct.pdf', mimeType: 'application/pdf' }, { id: 'F2', name: 'Receipt - Sep.pdf', mimeType: 'application/pdf' }] });
  s = await t.state();
  check('two receipts in Drive: no guess, the plain draft button', /Prepare my reply/.test(s.card || '') && !/File ready/.test(s.card || ''), s.card);
  await t.ctx.close();
  t = await open(browser, 'ask-drive-none', RQ, { watches: [W1], drive: [] });
  s = await t.state();
  check('nothing in Drive: silence about files, the plain draft button', /Prepare my reply/.test(s.card || '') && !/File ready/.test(s.card || ''), s.card);
  await t.ctx.close();

  // 29. a promised file: "attached" with nothing attached never closes it
  const WM = Object.assign({}, baseWatch, { messageId: 'm2', direction: 'mine', what: 'I will send you the signed contract by Friday.', file: CFILE });
  const PT = [msg(theirs, 'Please send the contract.'), msg(mine, 'I will send you the signed contract by Friday.')];
  t = await open(browser, 'promise-claim', PT.concat([msg(mine, 'Hi Dana, the contract is attached.')]), { watches: [WM] });
  s = await t.state();
  check('"attached" without an attachment does not keep a file promise', s.watches[0].status === 'waiting', s.watches);
  await t.ctx.close();
  t = await open(browser, 'promise-kept', PT.concat([msg(mine, 'Hi Dana, the contract is attached.', ['contract-signed.pdf'])]), { watches: [WM] });
  s = await t.state();
  check('a real attachment that says so keeps it, and the loop closes', s.watches[0].status === 'resolved' && s.watches[0].closedAs === 'kept', s.watches);
  await t.ctx.close();

  // 30. it learns how long THIS person takes
  const histDay = (i, d) => ({ id: 'h' + i, threadId: 'h' + i, direction: 'theirs', kind: 'reply', counterpart: { email: 'dana@acme.com', name: 'Dana Cole' }, status: 'resolved', closedAs: 'replied', subject: 'old ' + i, what: 'x', createdAt: new Date(2026, 7, 1 + i * 3, 12).getTime(), resolvedAt: new Date(2026, 7, 1 + i * 3 + d, 12).getTime() });
  const SLOWHIST = [6, 8, 5, 9, 7].map((d, i) => histDay(i, d));
  const NODL = 'Could you send me the final figure so I can book the vendor?';
  t = await open(browser, 'person-slow', [msg(theirs, 'Happy to proceed.'), msg(mine, NODL)], { watches: SLOWHIST });
  s = await t.state();
  check('with a slow replier the look-again day is later and says why', /usually takes about \d+ business days/.test(s.card || '') && !/Fri, Oct 2/.test(s.card || ''), s.card);
  await t.ctx.close();
  t = await open(browser, 'person-new', [msg(theirs, 'Happy to proceed.'), msg(mine, NODL)]);
  s = await t.state();
  check('a person Glance has no history with keeps the default day and says nothing about habits', /Fri, Oct 2/.test(s.card || '') && !/usually take/.test(s.card || ''), s.card);
  await t.ctx.close();

  // 31. learning from what happens next: free labels, no UI
  const SERVER_Q = 'Could use a heads-up on whether the courier collected the crate. Nothing shows on mine.';
  t = await open(browser, 'missed-ask', [msg(theirs, 'Hi, on it.'), msg(mine, SERVER_Q), msg(theirs, 'Looking now.'), msg(mine, 'Any update?')]);
  s = await t.state();
  let lab = await t.p.evaluate(() => ({ labels: window.__store.outcomeLabels, adapt: window.__store.intentAdapt }));
  check('a hand-made chase after an ask we missed is counted as a missed ask, once', lab.labels && lab.labels.missedAsk === 1, lab.labels);
  check('the model moved, and nothing of the sentence was stored', lab.adapt && Object.keys(lab.adapt.act || {}).length > 0 && !/courier|crate|shows/i.test(JSON.stringify(lab)), lab.adapt && Object.keys(lab.adapt.act || {}).length);
  await t.ctx.close();
  t = await open(browser, 'missed-none', [msg(theirs, 'Hi.'), msg(mine, ASK), msg(theirs, 'Looking now.'), msg(mine, 'Any update?')]);
  lab = await t.p.evaluate(() => ({ labels: window.__store.outcomeLabels }));
  check('if an earlier ask of mine WAS recognised, nothing was missed and nothing is learned', !lab.labels || !lab.labels.missedAsk, lab.labels);
  await t.ctx.close();
  t = await open(browser, 'confirm-model', ASKTHREAD.concat([msg(theirs, 'Confirmed, the final figure is 4,200.')]), { watches: [Object.assign({}, W2, { tier: 'model', what: SERVER_Q })] });
  lab = await t.p.evaluate(() => ({ labels: window.__store.outcomeLabels, adapt: window.__store.intentAdapt }));
  check('a loop only the model proposed (and was unsure about), then answered, is confirmed once and the model moves', lab.labels && lab.labels.confirmedAsk === 1 && Object.keys((lab.adapt || {}).act || {}).length > 0, lab);
  await t.ctx.close();
  t = await open(browser, 'confirm-rule', ASKTHREAD.concat([msg(theirs, 'Confirmed, the final figure is 4,200.')]), { watches: [W2] });
  lab = await t.p.evaluate(() => ({ labels: window.__store.outcomeLabels }));
  check('a word-list loop teaches the model nothing (it already knew)', !lab.labels || !lab.labels.confirmedAsk, lab.labels);
  await t.ctx.close();

  // 32. a new person at a company Glance already knows starts from their colleagues, and says so
  const corpHist = (who2, ds) => ds.map((d, i) => ({ id: 'c' + who2 + i, threadId: 'c' + who2 + i, direction: 'theirs', kind: 'reply', counterpart: { email: who2 + '@acme.com', name: who2 }, status: 'resolved', closedAs: 'replied', subject: 'old', what: 'x', createdAt: new Date(2026, 7, 3 + i * 7, 12).getTime(), resolvedAt: new Date(2026, 7, 3 + i * 7 + d, 12).getTime() }));
  t = await open(browser, 'person-colleagues', [msg(theirs, 'Happy to proceed.'), msg(mine, NODL)], { watches: corpHist('eli', [8, 9, 10, 8, 9]).concat(corpHist('noa', [9, 10, 8, 9, 10])) });
  s = await t.state();
  check('with no history of her own, a colleague-based day is offered and attributed to the colleagues, not to her', /people at acme\.com usually take about \d+ business days/.test(s.card || '') && !/Dana usually/.test(s.card || ''), s.card);
  await t.ctx.close();

  // 34. closes from outside the thread: money arrived at a payment provider, in an email of its own
  const BANK = { from: 'service@paypal.com', fromName: 'PayPal', to: 'me@x.com', toIsMe: true };
  const PAYOUT = Object.assign({}, PAYW, { id: 't9', threadId: 't9' });
  t = await open(browser, 'pay-signal', [msg(BANK, 'You have received $4,200.00 from Dana Cole. The money is now in your PayPal balance.')], { watches: [PAYOUT] });
  s = await t.state();
  let w9 = await t.p.evaluate(() => (window.__store.followWatches || []).find((w) => w.id === 't9'));
  check('a payment provider email for the amount a payment loop waits on closes it as paid, by signal', w9 && w9.status === 'resolved' && w9.closedAs === 'paid' && w9.resolvedBy === 'signal', w9);
  check('with a receipt that says what arrived and offers Reopen', /a payment of \$4,200 arrived/.test(s.card || '') && /Reopen/.test(s.card || ''), s.card);
  check('no script errors', s.errs.length === 0, s.errs);
  await t.ctx.close();
  t = await open(browser, 'pay-signal-client', [msg(theirs, 'Hi, you have received $4,200.00 from Dana Cole, sent this morning.')], { watches: [PAYOUT] });
  s = await t.state();
  w9 = await t.p.evaluate(() => (window.__store.followWatches || []).find((w) => w.id === 't9'));
  check('the same words from the client (not a payment provider) only ask, and the loop stays open', /Looks paid/.test(s.card || '') && /Mark paid/.test(s.card || '') && w9.status === 'waiting', { card: s.card, w9 });
  await t.p.click('.flow-fu-btn.ghost'); await t.p.waitForTimeout(300);
  w9 = await t.p.evaluate(() => (window.__store.followWatches || []).find((w) => w.id === 't9'));
  check('"Not yet" is remembered and the loop is untouched', w9.status === 'waiting' && (w9.signalDismissed || []).includes('payment'), w9);
  await t.ctx.close();
  t = await open(browser, 'pay-signal-other', [msg(BANK, 'You have received $999.00 from Dana Cole. The money is now in your PayPal balance.')], { watches: [PAYOUT] });
  s = await t.state();
  w9 = await t.p.evaluate(() => (window.__store.followWatches || []).find((w) => w.id === 't9'));
  check('a different amount closes nothing', w9.status === 'waiting' && s.card === null, { card: s.card, w9 });
  await t.ctx.close();

  // 35. how you write is learned as counts only; and one undecided sentence is kept as the single question
  t = await open(browser, 'style', [msg(theirs, 'Can you send the numbers for the vendor?'), msg(mine, 'Hi Dana,<br><br>' + ASK + '<br><br>Best,<br>Alex')]);
  const sp = await t.p.evaluate(() => window.__store.styleProfile);
  check('an own message teaches the style profile (counts only, no text)', sp && sp.n.en === 1 && !/Dana|vendor|figure|Alex/.test(JSON.stringify(sp)), sp);
  await t.ctx.close();
  t = await open(browser, 'question', [msg(theirs, 'Hi, ok.'), msg(mine, 'I was thinking we could maybe try a different approach.')]);
  s = await t.state();
  const aq = await t.p.evaluate(() => window.__store.activeQuestion);
  check('a sentence of mine the engine is torn about is kept as the one pending question, and Gmail stays quiet', aq && aq.pending && /different approach/.test(aq.pending.sentence) && s.card === null, { aq, card: s.card });
  check('and the question knows its thread, not just the words', aq && aq.pending && aq.pending.threadId === 't1' && aq.pending.counterpart && aq.pending.counterpart.email === 'dana@acme.com', aq && aq.pending);
  check('no script errors', s.errs.length === 0, s.errs);
  await t.ctx.close();

  // 33. more signals from outcomes: a missed promise, and closing carefully when its own closes keep being corrected
  t = await open(browser, 'missed-promise', [msg(theirs, 'Hi, thanks.'), msg(mine, 'ill pencil you in for thursday at nine, see you then'), msg(theirs, 'ok'), msg(mine, 'Attached the confirmation, here it is.')]);
  lab = await t.p.evaluate(() => ({ labels: window.__store.outcomeLabels, adapt: window.__store.intentAdapt }));
  check('delivering where no promise loop existed teaches the model the earlier promise, once, as numbers only', lab.labels && lab.labels.missedPromise === 1 && Object.keys((lab.adapt || {}).act || {}).length > 0 && !/thursday|pencil/i.test(JSON.stringify(lab)), lab);
  await t.ctx.close();

  const VAGUE = 'Let us see how this evolves over the coming quarter, there are many factors.';
  t = await open(browser, 'strict-off', ASKTHREAD.concat([msg(theirs, VAGUE)]), { watches: [W2] });
  s = await t.state();
  check('normally a reply that rests only on "they wrote back" closes the loop (as before)', s.watches[0].status === 'resolved', s.watches);
  await t.ctx.close();
  const strictStore = await (async () => { return { outcomeLabels: { missedAsk: 0, missedPromise: 0, confirmedAsk: 0, confirmedPromise: 0, autoClosed: 12, reopened: 4, seen: [] } }; })();
  t = await open(browser, 'strict-on', ASKTHREAD.concat([msg(theirs, VAGUE)]), { watches: [W2], store: strictStore });
  s = await t.state();
  check('once a third of its own closes were reopened, the same reply no longer closes the loop', s.watches[0].status === 'waiting', s.watches);
  await t.ctx.close();
  t = await open(browser, 'strict-rule', ASKTHREAD.concat([msg(theirs, 'Confirmed, the final figure is 4,200.')]), { watches: [W2], store: strictStore });
  s = await t.state();
  check('but a reply a rule understood (a real confirmation) still closes it', s.watches[0].status === 'resolved', s.watches);
  await t.ctx.close();

  t = await open(browser, 'reopen-counts', ASKTHREAD.concat([msg(theirs, 'Confirmed, the final figure is 4,200.')]), { watches: [W2] });
  await t.p.click('.flow-fu-btn.ghost'); await t.p.waitForTimeout(500);
  lab = await t.p.evaluate(() => window.__store.outcomeLabels);
  check('an auto-close and its reopen are both counted, so the error rate is measured', lab && lab.autoClosed === 1 && lab.reopened === 1, lab);
  await t.ctx.close();

  // 32. a request that takes several steps (core/resolution.js): "can you send me the receipt?"
  const RASK = 'Hi, could you send me the receipt for the ₪3,850 retainer payment?';
  const RT = [msg(theirs, RASK)];
  const PAYLOOP = { id: 'pay1', threadId: 'pay1', messageId: 'p1', subject: 'Retainer', counterpart: { email: 'dana@acme.com', name: 'Dana Cole' }, kind: 'payment', what: 'Please pay the retainer', amount: { value: 3850, currency: 'ILS', raw: '₪3,850' }, chaseIso: '2026-10-10', lang: 'en', createdAt: new Date(2026, 8, 20, 12).getTime(), status: 'waiting', direction: 'theirs', nudges: 0 };
  const SEEN = { paymentsSeen: [{ value: 3850, currency: 'ILS', at: new Date(2026, 9, 1, 9).getTime(), trusted: true }] };
  const ISSUER = { issuers: { receipt: { email: 'books@my-accountant.co.il', name: 'Noa Books' } } };

  // 32a. found existing: one receipt in Drive. No Do It chip claims "Handled"; the loop card says what it did and that nothing was sent.
  t = await open(browser, 'res-found', RT, { drive: [{ id: 'F1', name: 'Receipt - Dana retainer.pdf', mimeType: 'application/pdf' }, { id: 'F9', name: 'Budget.xlsx', mimeType: 'application/vnd.ms-excel' }] });
  s = await t.state();
  check('found existing: one card, naming the file and what "done" means', /Next: receipt/.test(s.card || '') && /Found Receipt - Dana retainer\.pdf/.test(s.card || '') && /Done when: A receipt for ₪3,850 sent to Dana, as a real attachment/.test(s.card || ''), s.card);
  check('and no Do It chip competes with it', await t.p.evaluate(() => !document.querySelector('.flow-chip-host')));
  check('nothing was opened before a tap', s.watches.length === 0, s.watches);
  await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(600);
  const rd = await t.p.evaluate(() => window.__msgs.find((m) => m.type === 'flow:follow-draft'));
  s = await t.state();
  check('the draft attaches exactly that Drive file and says so', rd && rd.payload.driveFileId === 'F1' && /Attached is the receipt for ₪3,850: Receipt - Dana retainer\.pdf/.test(rd.payload.body), rd && rd.payload);
  check('the draft goes to the person who asked, and is a draft', rd && rd.payload.to === 'dana@acme.com' && !s.msgs.some((m) => /send/.test(m) && m !== 'flow:search-drive'));
  check('one loop of mine opened, carrying the path; preparing did not close it', s.watches.length === 1 && s.watches[0].direction === 'mine' && s.watches[0].status === 'waiting' && s.watches[0].resolution && s.watches[0].resolution.stage === 'prepare' && s.watches[0].resolution.preparedFile === 'Receipt - Dana retainer.pdf', s.watches);
  check('the receipt in the page says nothing was sent and when it will close', /Nothing was sent\. I will close this when you send the receipt\./.test(s.card || ''), s.card);
  await t.ctx.close();

  // 32b. not found, nothing confirmed: the next step is a question, not silence and not a made-up receipt
  t = await open(browser, 'res-none', RT, {});
  s = await t.state();
  check('not found: it says what it could not find and asks the one question', /cannot find a payment of ₪3,850 from Dana\. Was it paid\?/.test(s.card || '') && /Yes, it is paid/.test(s.card || '') && /Not yet/.test(s.card || ''), s.card);
  check('no draft, no file, no loop yet', !s.msgs.includes('flow:follow-draft') && s.watches.length === 0, s);
  await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(700);
  s = await t.state();
  check('"paid" advances the path at once: no receipt exists and none is made, so it asks who issues them', /Who issues your receipts\?/.test(s.card || '') && /cannot issue/.test(s.card || '') && /Save and ask them/.test(s.card || ''), s.card);
  check('the loop is open and says why', s.watches.length === 1 && s.watches[0].resolution.assertedPaidAt && s.watches[0].resolution.stage === 'verify' && s.watches[0].status === 'waiting', s.watches);
  await t.p.fill('.flow-fu-input', 'not an address'); await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(400);
  check('a non-address is not saved', await t.p.evaluate(() => !(window.__store.issuers && window.__store.issuers.receipt)));
  await t.p.fill('.flow-fu-input', 'books@my-accountant.co.il'); await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(700);
  s = await t.state();
  check('with an issuer saved, the same path continues: ask them (a draft)', /Ask books@my-accountant\.co\.il to issue it/.test(s.card || ''), s.card);
  await t.ctx.close();

  // 32c. needs a request to someone else
  t = await open(browser, 'res-request', RT, { store: Object.assign({}, SEEN, ISSUER) });
  s = await t.state();
  check('payment seen at the bank and an issuer known: ask them, no question about payment', /Ask Noa Books to issue it/.test(s.card || '') && !/Was it paid/.test(s.card || ''), s.card);
  await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(700);
  const rq = await t.p.evaluate(() => window.__msgs.find((m) => m.type === 'flow:follow-draft'));
  s = await t.state();
  check('the draft goes to the issuer and asks for the file, naming payer and amount', rq && rq.payload.to === 'books@my-accountant.co.il' && /issue a receipt for Dana Cole for ₪3,850/.test(rq.payload.body) && !/attached|enclosed/i.test(rq.payload.body), rq && rq.payload);
  check('the loop waits on the issuer and is not closed', s.watches[0].status === 'waiting' && s.watches[0].resolution.requestedTo === 'Noa Books' && s.watches[0].resolution.stage === 'request', s.watches);
  await t.ctx.close();

  // 32d. cannot complete yet: the money is still being chased
  t = await open(browser, 'res-blocked', RT, { watches: [PAYLOOP] });
  s = await t.state();
  check('a payment still being chased: no receipt path, it says the payment is not confirmed', !/Prepare|Ask .* to issue/.test(s.card || '') && s.card && /not confirmed/.test(s.card), s.card);
  check('nothing was drafted', !s.msgs.includes('flow:follow-draft'));
  await t.ctx.close();

  // 32e. a bank email opened earlier is remembered as numbers, and used
  t = await open(browser, 'res-bank', [msg({ from: 'noreply@bankhapoalim.co.il', fromName: 'Bank Hapoalim', to: 'me@x.com', toIsMe: true }, 'התקבל תשלום על סך ₪3,850 לחשבונך')], {});
  s = await t.state();
  const seen = await t.p.evaluate(() => window.__store.paymentsSeen);
  check('a payment confirmation opened in Gmail is kept as an amount and a day, never its text', Array.isArray(seen) && seen.length === 1 && seen[0].value === 3850 && Object.keys(seen[0]).sort().join() === 'at,currency,trusted,value' && !/התקבל/.test(JSON.stringify(seen)), seen);
  await t.ctx.close();

  // 32f. closes only when it was really delivered
  const RW = { id: 't1', threadId: 't1', messageId: 'm1', subject: 'Vendor booking', counterpart: { email: 'dana@acme.com', name: 'Dana Cole' }, kind: 'reply', what: RASK, amount: { value: 3850, currency: 'ILS', raw: '₪3,850' }, chaseIso: '2026-10-05', lang: 'en', createdAt: new Date(2026, 8, 28, 12).getTime(), status: 'waiting', direction: 'mine', taskRef: { taskListId: 'L', taskId: 'T9' }, nudges: 0, file: { object: 'receipt', label: 'receipt', lang: 'en', synonym: ['receipt', 'קבלה'] }, resolution: { v: 1, object: 'receipt', label: 'receipt', lang: 'en', done: 'A receipt for ₪3,850 sent to Dana, as a real attachment', stage: 'prepare', preparedAt: 1, preparedFile: 'Receipt.pdf', trail: [] } };
  t = await open(browser, 'res-claim', RT.concat([msg(mine, 'Hi Dana, the receipt is attached.')]), { watches: [RW] });
  s = await t.state();
  check('"attached" with nothing attached does not close it, and says so', s.watches[0].status === 'waiting' && /nothing is attached/.test(s.card || ''), { w: s.watches, card: s.card });
  await t.ctx.close();
  t = await open(browser, 'res-wrongfile', RT.concat([msg(mine, 'See attached.', ['IMG_2231.pdf'])]), { watches: [RW] });
  s = await t.state();
  check('a file not named for it: kept open with one question', s.watches[0].status === 'waiting' && /Did the receipt go out\?/.test(s.card || ''), { w: s.watches, card: s.card });
  await t.p.click('.flow-fu-btn.primary'); await t.p.waitForTimeout(500);
  s = await t.state();
  check('"yes, it is done" closes it, labelled as the person\'s own call', s.watches[0].status === 'resolved' && s.watches[0].resolvedBy === 'manual', s.watches);
  await t.ctx.close();
  t = await open(browser, 'res-delivered', RT.concat([msg(mine, 'Hi Dana, here you go.', ['Receipt-Dana-Oct.pdf'])]), { watches: [RW] });
  s = await t.state();
  check('a real receipt attached to a message I sent: closed, with what was sent', s.watches[0].status === 'resolved' && s.watches[0].resolvedBy === 'delivered' && s.watches[0].resolution.stage === 'close' && s.watches[0].resolution.deliveredFiles[0] === 'Receipt-Dana-Oct.pdf' && /Receipt-Dana-Oct\.pdf\. Loop closed\./.test(s.card || ''), { w: s.watches, card: s.card });
  check('its reminder is completed', s.msgs.includes('flow:follow-complete'));
  await t.ctx.close();


  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('\nTOTAL FAILURES: ' + failures);
  process.exit(failures ? 1 : 0);
})();
