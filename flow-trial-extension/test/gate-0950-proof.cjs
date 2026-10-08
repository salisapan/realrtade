// Gate 0.9.49 fixtures, proved in Chromium (light color scheme).
// 3: a Hebrew To line with a bidi mark and NBSP, address on the next node, fills To.
// 5: Suggested and Added stay visible on a Loops list that has no step list.
// 6: "No need to reply, just get it done" is a To Do, and list-sender wire mail stays quiet.
// Run: node test/gate-0950-proof.cjs
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('@playwright/test')); }

const ROOT = path.join(__dirname, '..');
const FIXTURES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/gate-049-scenario-a.json'), 'utf8'));
const ME = 'glance.salisapan@outlook.com';
const STALE = 'AQQkSTALEALPHAONLY';
let failures = 0;

function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 800) : '');
  }
}

function fixture(id) {
  return FIXTURES.fixtures.find((f) => f.id === id);
}

function paneHtml(opts) {
  const o = opts || {};
  const subject = o.subject || 'Subject';
  const body = o.body || 'Hi';
  const header = o.header || '';
  return '<!doctype html><html lang="he" dir="rtl"><head><title>דואר</title></head><body>' +
    '<div role="main"><div id="ReadingPaneContainerId">' +
    '<div role="heading" aria-level="2">' + subject + '</div>' +
    '<div class="messageItem"><div class="hdr">' + header + '</div>' +
    '<div role="document" class="allowTextSelection"><div class="UniqueMessageBody">' + body + '</div></div>' +
    '</div></div></div></body></html>';
}

const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'incoming-judge.js']
  .map((f) => path.join(ROOT, 'core', f));

async function loadEngine(page) {
  await page.addScriptTag({ path: path.join(ROOT, 'core', 'owa-parse.js') });
  for (const file of CORE) await page.addScriptTag({ path: file });
  await page.addScriptTag({ content:
    'window.__eng = {' +
    'parse: typeof FlowOwaParse !== "undefined" ? FlowOwaParse : null,' +
    'intent: typeof FlowIntent !== "undefined" ? FlowIntent : null,' +
    'judge: typeof FlowIncomingJudge !== "undefined" ? FlowIncomingJudge : null' +
    '};'
  });
}

async function readPane(page, html, href) {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await loadEngine(page);
  return page.evaluate(({ href, own }) => {
    const pane = window.__eng.parse.readPane(document, href, { own: own, userName: 'Glance' });
    return pane;
  }, { href: href, own: [ME] });
}

function lum(rgb) {
  const m = String(rgb || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return -1;
  const ch = [m[1], m[2], m[3]].map((n) => {
    const c = Number(n) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

(async () => {
  const q3 = fixture('gate049-q3');
  const park = fixture('gate049-parking');
  const outlookSrc = fs.readFileSync(path.join(ROOT, 'src', 'content-outlook.js'), 'utf8');
  const popupSrc = fs.readFileSync(path.join(ROOT, 'popup', 'popup.js'), 'utf8');
  const reasonAt = outlookSrc.indexOf('async function pageReason');
  const reasonSlice = outlookSrc.slice(reasonAt, reasonAt + 1600);
  check('hedge why-not stores addresseeName, toCount, ccCount, and rawToLine',
    reasonSlice.indexOf('addresseeName:') > 0 && reasonSlice.indexOf('toCount:') > 0 &&
    reasonSlice.indexOf('ccCount:') > 0 && reasonSlice.indexOf('rawToLine:') > 0);
  check('Loops emits a Suggested or Added heading for every card state',
    popupSrc.indexOf("setAttribute('data-glance-section', which)") > 0 &&
    popupSrc.indexOf("which === 'added' ? 'Added' : 'Suggested'") > 0 &&
    popupSrc.indexOf('receipts.forEach') > 0);
  const scoped = fs.readFileSync(path.join(ROOT, 'design/step-states-v1/scoped.css'), 'utf8');
  check('dark theme hides the Do It glyph by class, whatever its URL',
    scoped.indexOf('.flow-step-card[data-theme="dark"] img.chip-do,') >= 0 &&
    scoped.indexOf('img.chip-do[src="do-it.png"]') < 0);

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ colorScheme: 'light' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  const q3Href = 'https://outlook.live.com/mail/0/inbox/id/' + STALE;
  const q3Header =
    '<span class="persona" title="flow &lt;ai.local.flow@gmail.com&gt;">flow</span>' +
    '<span class="to-label">\u200E\u00A0אל\u00A0:</span>' +
    '<span class="to-addr">' + ME + '</span>';
  const q3Pane = await readPane(page, paneHtml({
    subject: q3.subject,
    body: q3.body.replace(/\n/g, '<br>'),
    header: q3Header
  }), q3Href);
  check('engine loaded', !errors.length, errors);
  check('bidi To line puts the reader in To',
    q3Pane && Array.isArray(q3Pane.to) && q3Pane.to.indexOf(ME) >= 0 && (!q3Pane.cc || !q3Pane.cc.length),
    { to: q3Pane && q3Pane.to, cc: q3Pane && q3Pane.cc, raw: q3Pane && q3Pane.rawToLine });
  check('raw To line keeps אל and the address',
    q3Pane && /אל/.test(q3Pane.rawToLine) && q3Pane.rawToLine.indexOf(ME) >= 0,
    q3Pane && q3Pane.rawToLine);
  check('a URL conversation id that is not on the open mail is not the pane id',
    q3Pane && q3Pane.conversationId == null && q3Pane.idSource === 'url-unconfirmed' && q3Pane.idKind === 'conversation',
    { conversationId: q3Pane && q3Pane.conversationId, idSource: q3Pane && q3Pane.idSource, idKind: q3Pane && q3Pane.idKind });

  const judged = await page.evaluate((input) => {
    return window.__eng.judge.judge(input);
  }, {
    text: q3.body,
    subject: q3.subject,
    sender: { name: q3.fromName, email: q3.from },
    now: '2026-10-08T09:53:00Z',
    surface: 'outlook',
    to: q3Pane.to,
    cc: q3Pane.cc,
    ownAddresses: [ME],
    userName: 'Sali',
    inbound: true
  });
  const kinds = ((judged && judged.process && judged.process.steps) || []).map((s) => s.kind);
  const engineQ3 = await page.evaluate((input) => window.__eng.judge.judge(input), {
    text: q3.body,
    subject: q3.subject,
    sender: { name: q3.fromName, email: q3.from },
    surface: 'outlook',
    to: q3.to,
    cc: [],
    ownAddresses: [ME],
    userName: 'Sali',
    inbound: true
  });
  const engineKinds = ((engineQ3 && engineQ3.process && engineQ3.process.steps) || []).map((s) => s.kind);
  const named = await page.evaluate((body) => window.__eng.intent.openingAddressee(body), q3.body);
  check('gate049 Q3 Hi plus a valid To is a draft, not hedge',
    engineQ3 && engineQ3.show === true && engineKinds.indexOf('outlookDraft') >= 0 &&
    String(engineQ3.reason || '').indexOf('hedge') < 0 && named === '',
    { show: engineQ3 && engineQ3.show, reason: engineQ3 && engineQ3.reason, type: engineQ3 && engineQ3.intent && engineQ3.intent.type, kinds: engineKinds, named: named });
  check('the same Q3 mail read from the pane still drafts',
    judged && judged.show === true && kinds.indexOf('outlookDraft') >= 0,
    { show: judged && judged.show, reason: judged && judged.reason, kinds: kinds });
  const hiDana = await page.evaluate((input) => window.__eng.judge.judge(input), {
    text: 'Hi Dana, can you reply and confirm whether the Q3 summary will include the October numbers?',
    subject: q3.subject,
    sender: { name: 'flow', email: q3.from },
    surface: 'outlook',
    to: [ME],
    ownAddresses: [ME],
    userName: 'Sali',
    inbound: true
  });
  check('Hi Dana stays hedge when the user is Sali',
    hiDana && hiDana.show !== true && hiDana.reason === 'quiet:hedge',
    { show: hiDana && hiDana.show, reason: hiDana && hiDana.reason });
  for (const opener of ['Hi all', 'Hi team', 'Hi there']) {
    const group = await page.evaluate((input) => window.__eng.judge.judge(input), {
      text: opener + ',\n\nPlease reply with your availability for the launch checklist by Wednesday, October 14.\n\nCheers,\nDana',
      subject: 'Launch checklist',
      sender: { name: 'Dana', email: 'dana@acme.com' },
      surface: 'outlook',
      to: [ME],
      ownAddresses: [ME],
      userName: 'Sali',
      inbound: true
    });
    const groupKinds = ((group && group.process && group.process.steps) || []).map((s) => s.kind);
    check(opener + ' with Sali in To offers a draft',
      group && group.show === true && groupKinds.indexOf('outlookDraft') >= 0 && String(group.reason || '').indexOf('hedge') < 0,
      { show: group && group.show, reason: group && group.reason, kinds: groupKinds });
  }

  const linked = await page.evaluate(() => {
    const parse = window.__eng.parse;
    function file(name, size) {
      return { name: name, size: size, contentType: 'application/pdf', isInline: false };
    }
    function msg(id, conv, when, files, subject) {
      return {
        id: id, conversationId: conv, receivedDateTime: when, subject: subject,
        from: { emailAddress: { address: 'ai.local.flow@gmail.com', name: 'flow' } },
        attachments: files
      };
    }
    const nwWhen = '2026-10-08T14:01:00.000Z';
    const north = parse.uniqueGraphMessage(
      { subject: 'Northwind agreement - signed PDF', senderEmail: 'ai.local.flow@gmail.com', conversationId: 'AQQkStale', idKind: 'conversation', idSource: 'url-unconfirmed', receivedDateTime: nwWhen, attachments: [{ name: '…hwind-agreement-signed.pdf', sizeLabel: '3 KB' }] },
      [msg('m-nw', 'AQQkNw', nwWhen, [file('northwind-agreement-signed.pdf', 3072)], 'Northwind agreement - signed PDF')]
    );
    const twinAt = '2026-10-08T11:37:50.000Z';
    const alpha = parse.uniqueGraphMessage(
      { subject: 'Q3 fund statement', conversationId: 'AQQkOld', idKind: 'conversation', idSource: 'url-unconfirmed', receivedDateTime: twinAt, attachments: [{ name: '…t-q3-alpha.pdf', sizeLabel: '3 KB' }] },
      [
        msg('m-old', 'AQQkOld', '2026-10-01T14:37:00.000Z', [file('statement-q3-old.pdf', 1000)], 'Q3 fund statement'),
        msg('m-alpha', 'AQQkAlpha', twinAt, [file('statement-q3-alpha.pdf', 3072)], 'Q3 fund statement'),
        msg('m-beta', 'AQQkBeta', '2026-10-08T11:37:59.000Z', [file('statement-q3-beta.pdf', 4096)], 'Q3 fund statement')
      ]
    );
    return {
      northId: north && north.message && north.message.id,
      northDetail: north && north.detail,
      alphaId: alpha && alpha.message && alpha.message.id,
      alphaDetail: alpha && alpha.detail
    };
  });
  check('Chromium links the Northwind chip when the conversation id is another mail',
    linked && linked.northId === 'm-nw', linked);
  check('Chromium links statement-q3-alpha.pdf when an older id is on the open mail',
    linked && linked.alphaId === 'm-alpha' && /time-file/.test(linked.alphaDetail || ''), linked);

  const convId = 'AQQkAAAAAAFNPyybyE5TKbM3tgp2Qjp';
  await page.setContent('<!doctype html><html lang="he" dir="rtl"><body><div role="main"><div id="ReadingPaneContainerId">' +
    '<div class="SubjectLine allowTextSelection" role="heading" id="MSG_wAH0HSIHwAA_SUBJECT" aria-labelledby="CONV_KbM3tgp2Qjp_SUBJECT">Northwind agreement - signed PDF</div>' +
    '<div id="focused"><div role="document" class="XbIp4">Please find the signed Northwind agreement attached.</div></div>' +
    '</div></div></body></html>', { waitUntil: 'domcontentloaded' });
  await loadEngine(page);
  const bodyRoot = await page.evaluate((href) => {
    const pane = window.__eng.parse.readPane(document, href, { own: ['glance.salisapan@outlook.com'], userName: 'Sali' });
    const root = window.__eng.parse.openBodyRoot(window.__eng.parse.readingPaneRoots(document));
    return {
      text: pane && pane.text,
      subject: pane && pane.subject,
      conversationId: pane && pane.conversationId,
      idSource: pane && pane.idSource,
      role: root && root.getAttribute && root.getAttribute('role')
    };
  }, 'https://outlook.live.com/mail/0/inbox/id/' + convId);
  check('the subject line is not the message body',
    bodyRoot && /signed Northwind agreement attached/.test(bodyRoot.text) && bodyRoot.text !== bodyRoot.subject && bodyRoot.role === 'document',
    bodyRoot);
  check('a CONV_ tail on the heading keeps the URL conversation id',
    bodyRoot && bodyRoot.conversationId === convId && bodyRoot.idSource === 'open-mail',
    bodyRoot);

  // Measured 2026-10-08 on the Gate 0.9.51 profile. The subject heading and
  // the message are two allowTextSelection nodes. The prose is under
  // visibility=hidden inside role=document. A visible crumb must not win.
  const nwId = 'AQQkADAwATM0MDAAMS0wZTAwAC04MzYzLTAwAi0wMAoAEADWD1Rr89HKRZEoW5l2yyiY';
  const q3Id = 'AQQkADAwATM0MDAAMS0wZTAwAC04MzYzLTAwAi0wMAoAEAAFNPyybyE5TKbM3tgp2Qjp';
  const q3Body = 'Hi,\n\nCan you reply and confirm whether the Q3 summary will include the October numbers?\n\nThanks,\nFlow test';
  const passBody = 'Hi, We agreed to renew the passport application by Friday. Thanks, Flow Gate';
  function measuredPane(subject, convTail, bodyHtml, extra) {
    return '<!doctype html><html lang="he" dir="rtl"><head><style>[visibility="hidden"]{visibility:hidden}</style></head><body><div role="main"><div id="ReadingPaneContainerId">' +
      '<div class="adPpR mJflQ allowTextSelection"><div class="MshDW m41se"><div class="UUCdJ PKstT"><div class="f77rj">' +
      '<span class="JdFsz" title="' + subject + '" role="heading" aria-level="3" id="CONV_' + convTail + '_SUBJECT">' + subject + '</span>' +
      '</div></div></div></div>' +
      '<span class="persona" title="flow &lt;ai.local.flow@gmail.com&gt;">flow</span>' +
      '<div role="heading" aria-level="3" aria-label="אל: glance.salisapan@outlook.com"><span>אל:</span><span aria-label="glance.salisapan@outlook.com">glance.salisapan@outlook.com</span></div>' +
      '<div class="XbIp4 jmmB7 customScrollBar GNqVo allowTextSelection">' +
      '<div tabindex="0" aria-label="גוף ההודעה" role="document" aria-live="polite" class="OuGoX BIZfh" id="UniqueMessageBody_11">' +
      '<span class="crumb">תרגם</span>' +
      '<div visibility="hidden"><div class="rps_c22a"><div><div dir="auto">' + bodyHtml + '</div></div></div></div>' +
      '</div></div>' + (extra || '') +
      '</div></div></body></html>';
  }
  await page.setContent(measuredPane('Northwind agreement - signed PDF', 'ZEoW5l2yyiY', 'Hi,<br><br>The signed Northwind agreement is attached.<br><br>Thanks,<br>Flow',
    '<button aria-label="northwind-agreement-signed.pdf 48 KB">northwind-agreement-signed.pdf 48 KB</button>'), { waitUntil: 'domcontentloaded' });
  await loadEngine(page);
  const measured = await page.evaluate((href) => {
    const pane = window.__eng.parse.readPane(document, href, { own: ['glance.salisapan@outlook.com'], userName: 'Sali' });
    const root = window.__eng.parse.openBodyRoot(window.__eng.parse.readingPaneRoots(document));
    const doc = document.querySelector('[role="document"]');
    return {
      text: pane && pane.text,
      subject: pane && pane.subject,
      conversationId: pane && pane.conversationId,
      idSource: pane && pane.idSource,
      role: root && root.getAttribute && root.getAttribute('role'),
      innerText: doc ? doc.innerText : ''
    };
  }, 'https://outlook.live.com/mail/0/inbox/id/' + nwId);
  check('a hidden wrapper still yields the Northwind body, not the subject',
    measured && measured.role === 'document' && measured.subject === 'Northwind agreement - signed PDF' &&
    /The signed Northwind agreement is attached/.test(measured.text || '') &&
    measured.text !== measured.subject && /\n/.test(measured.text) &&
    measured.innerText.indexOf('The signed') < 0 &&
    measured.conversationId === nwId && measured.idSource === 'open-mail',
    measured);
  await page.setContent(measuredPane('Gate A 0.9.41 – quick question on the Q3 summary', 'KbM3tgp2Qjp',
    'Hi,<br><br>Can you reply and confirm whether the Q3 summary will include the October numbers?<br><br>Thanks,<br>Flow test'), { waitUntil: 'domcontentloaded' });
  await loadEngine(page);
  const q3Measured = await page.evaluate((href) => {
    const pane = window.__eng.parse.readPane(document, href, { own: ['glance.salisapan@outlook.com'], userName: 'Sali' });
    const judged = window.__eng.judge.judge({
      text: pane && pane.text,
      subject: pane && pane.subject,
      sender: { name: 'flow', email: 'ai.local.flow@gmail.com' },
      surface: 'outlook',
      to: pane && pane.to,
      cc: [],
      ownAddresses: ['glance.salisapan@outlook.com'],
      userName: 'Sali',
      inbound: true
    });
    return {
      text: pane && pane.text,
      conversationId: pane && pane.conversationId,
      to: pane && pane.to,
      show: judged && judged.show,
      reason: judged && judged.reason,
      kinds: ((judged && judged.process && judged.process.steps) || []).map((s) => s.kind)
    };
  }, 'https://outlook.live.com/mail/0/inbox/id/' + q3Id);
  check('the Q3 seed under the hidden wrapper is a reply draft',
    q3Measured && q3Measured.text === q3Body && q3Measured.conversationId === q3Id &&
    q3Measured.to && q3Measured.to.indexOf('glance.salisapan@outlook.com') >= 0 &&
    q3Measured.show === true && q3Measured.kinds.indexOf('outlookDraft') >= 0,
    q3Measured);
  const passJudged = await page.evaluate((text) => {
    const r = window.__eng.judge.judge({
      text: text,
      subject: 'Gate 0.9.35 To Do title',
      sender: { name: 'flow', email: 'ai.local.flow@gmail.com' },
      now: '2026-10-08T13:34:00Z',
      surface: 'outlook',
      to: ['glance.salisapan@outlook.com'],
      ownAddresses: ['glance.salisapan@outlook.com'],
      userName: 'Sali',
      inbound: true
    });
    return { show: r && r.show, reason: r && r.reason, type: r && r.intent && r.intent.type, label: r && r.intent && r.intent.label, kinds: ((r && r.process && r.process.steps) || []).map((s) => s.kind) };
  }, passBody);
  check('the passport 0.9.35 seed is read as an open loop',
    passJudged && passJudged.show === true && passJudged.kinds.indexOf('outlookTask') >= 0,
    passJudged);
  await page.setContent('<!doctype html><html><head></head><body><div class="flow-step-card" data-theme="dark"><button class="do-halo"><img class="chip-do" src="chrome-extension://glance/design/step-states-v1/do-it.png" alt="Do It"><span class="doit-dark">[Do It]</span></button></div></body></html>');
  await page.addStyleTag({ path: path.join(ROOT, 'design/step-states-v1/scoped.css') });
  const doIts = await page.evaluate(() => {
    const visible = (el) => getComputedStyle(el).display !== 'none';
    return {
      img: visible(document.querySelector('img.chip-do')),
      span: visible(document.querySelector('.doit-dark'))
    };
  });
  check('a full Do It image URL stays hidden while the dark label shows',
    doIts && doIts.img === false && doIts.span === true, doIts);

  const ccPane = await readPane(page, paneHtml({
    subject: q3.subject,
    body: q3.body.replace(/\n/g, '<br>'),
    header: '<span class="persona" title="flow &lt;ai.local.flow@gmail.com&gt;">flow</span>' +
      '<span>אל: dana@acme.com</span><span>עותק: ' + ME + '</span>'
  }), 'https://outlook.live.com/mail/0/inbox/');
  const ccJudged = await page.evaluate((input) => window.__eng.judge.judge(input), {
    text: q3.body,
    subject: q3.subject,
    sender: { name: 'flow', email: 'ai.local.flow@gmail.com' },
    surface: 'outlook',
    to: ccPane.to,
    cc: ccPane.cc,
    ownAddresses: [ME],
    userName: 'Glance',
    inbound: true
  });
  check('Cc-only keeps the reader out of To and stays hedge',
    ccPane && ccPane.to.indexOf('dana@acme.com') >= 0 && ccPane.to.indexOf(ME) < 0 &&
    ccPane.cc.indexOf(ME) >= 0 && ccJudged && ccJudged.show !== true &&
    ccJudged.reason === 'quiet:hedge',
    { to: ccPane && ccPane.to, cc: ccPane && ccPane.cc, reason: ccJudged && ccJudged.reason });

  const headerOnly = await readPane(page, paneHtml({
    subject: q3.subject,
    body: 'Hi',
    header: '<span class="persona" title="flow &lt;ai.local.flow@gmail.com&gt;">flow</span>' +
      '<span class="chip">' + ME + '</span>'
  }), 'https://outlook.live.com/mail/0/inbox/');
  check('an own address in the pane header, with no אל label, is To',
    headerOnly && headerOnly.to.indexOf(ME) >= 0, { to: headerOnly && headerOnly.to, raw: headerOnly && headerOnly.rawToLine });

  const bodyOnly = await readPane(page, paneHtml({
    subject: q3.subject,
    body: 'Please write ' + ME + ' back.',
    header: '<span class="persona" title="flow &lt;ai.local.flow@gmail.com&gt;">flow</span>'
  }), 'https://outlook.live.com/mail/0/inbox/');
  check('an own address in the body is not To',
    bodyOnly && bodyOnly.to.length === 0, { to: bodyOnly && bodyOnly.to });

  const fromOnly = await readPane(page, paneHtml({
    subject: q3.subject,
    body: 'Hi',
    header: '<span>מאת: ' + ME + '</span>'
  }), 'https://outlook.live.com/mail/0/inbox/');
  check('an own address on From is not To',
    fromOnly && fromOnly.to.indexOf(ME) < 0, { to: fromOnly && fromOnly.to, raw: fromOnly && fromOnly.rawToLine });

  const parkJudged = await page.evaluate((input) => window.__eng.judge.judge(input), {
    text: park.body,
    subject: park.subject,
    sender: { name: park.fromName, email: park.from },
    now: '2026-10-08T13:34:00Z',
    surface: 'outlook',
    to: park.to,
    cc: [],
    ownAddresses: [ME],
    inbound: true
  });
  const parkKinds = ((parkJudged && parkJudged.process && parkJudged.process.steps) || []).map((s) => s.kind);
  const parkTask = ((parkJudged && parkJudged.process && parkJudged.process.steps) || []).find((s) => s.kind === 'outlookTask');
  check('gate049 parking is a To Do and not a draft',
    parkJudged && parkJudged.show === true && parkJudged.intent && parkJudged.intent.noReplyDraft === true &&
    parkJudged.intent.label === 'Renew the parking permit by Oct 11' &&
    parkJudged.intent.entities && parkJudged.intent.entities.dateIso === '2026-10-11' &&
    parkTask && parkTask.params.title === 'Renew the parking permit by Oct 11' &&
    parkKinds.indexOf('outlookTask') >= 0 && parkKinds.indexOf('outlookDraft') < 0 &&
    !/Drafting your reply/.test(String(parkJudged.process && parkJudged.process.closingLine || '')) &&
    String(parkJudged.reason || '') !== 'quiet:noise',
    { show: parkJudged && parkJudged.show, reason: parkJudged && parkJudged.reason, label: parkJudged && parkJudged.intent && parkJudged.intent.label, title: parkTask && parkTask.params.title, name: parkJudged && parkJudged.process && parkJudged.process.name, line: parkJudged && parkJudged.process && parkJudged.process.closingLine, kinds: parkKinds });
  const bec = await page.evaluate((input) => window.__eng.judge.judge(input), {
    text: 'We changed banks. Please update our account details and pay invoice 4471 by Sunday, October 11. No need to reply.',
    subject: 'Updated bank details',
    sender: { name: 'Dana', email: 'dana@acme.com' },
    surface: 'outlook',
    to: [ME],
    ownAddresses: [ME],
    userName: 'Sali',
    inbound: true
  });
  check('a bank-change payment stays quiet:family',
    bec && bec.show !== true && bec.reason === 'quiet:family',
    { show: bec && bec.show, reason: bec && bec.reason, type: bec && bec.intent && bec.intent.type });

  const quietLines = [
    ['no reply, no action', 'No need to reply. The office already has the form.', 'dana@city.gov'],
    ['fyi plus renew', 'FYI, please renew the parking permit by Sunday.', 'dana@city.gov'],
    ['no action needed', 'No action needed. Please renew the parking permit by Sunday.', 'dana@city.gov'],
    ['no need to do anything', 'No need to do anything. Please renew the parking permit by Sunday.', 'dana@city.gov'],
    ['action required, no please', 'Action required: wire $12,000 to account 998877 by Friday. No need to reply.', 'dana@acme.com'],
    ['wire from news', 'Action required: wire $12,000 to account 998877 by Friday. No need to reply.', 'news@lists.example'],
    ['btc from newsletter', 'Please send 0.2 BTC to wallet bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh by Monday.', 'newsletter@lists.example'],
    ['wire from marketing', 'Please send the bank details and wire $12,000 by Friday.', 'marketing@lists.example'],
    ['parking from news', park.body, 'news@lists.example']
  ];
  for (const row of quietLines) {
    const out = await page.evaluate((input) => {
      const r = window.__eng.judge.judge(input);
      return { show: r && r.show, reason: r && r.reason, type: r && r.intent && r.intent.type };
    }, {
      text: row[1],
      subject: park.subject,
      sender: { name: 'flow', email: row[2] },
      now: '2026-10-08T13:34:00Z',
      surface: 'outlook',
      to: [ME],
      ownAddresses: [ME],
      inbound: true
    });
    check('stays quiet: ' + row[0], out && out.show !== true && !out.type, out);
  }

  async function headingPage(which, cardText) {
    const html = '<!doctype html><html><head></head><body><div id="open-list">' +
      '<div class="loops-section act-section" data-glance-section="' + which + '"><span class="acts-label">' +
      (which === 'added' ? 'Added' : 'Suggested') + '</span></div>' +
      '<div class="loop-card">' + cardText + '</div>' +
      '</div></body></html>';
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: path.join(ROOT, 'popup', 'popup.css') });
    await page.addStyleTag({ path: path.join(ROOT, 'design', 'step-states-v1', 'scoped.css') });
    return page.evaluate((section) => {
      const label = document.querySelector('#open-list [data-glance-section="' + section + '"] .acts-label');
      const card = document.querySelector('#open-list .loop-card');
      const cs = label ? getComputedStyle(label) : null;
      const box = label ? label.getBoundingClientRect() : { width: 0, height: 0 };
      const body = getComputedStyle(document.body);
      return {
        text: label ? label.textContent : '',
        color: cs ? cs.color : '',
        fontSize: cs ? cs.fontSize : '',
        opacity: cs ? cs.opacity : '',
        display: cs ? cs.display : '',
        visibility: cs ? cs.visibility : '',
        width: box.width,
        height: box.height,
        bodyColor: body.backgroundColor,
        ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
        innerHeading: card ? card.querySelector('.acts-label') : null
      };
    }, which);
  }

  const suggested = await headingPage('suggested', 'Do It');
  const handled = await headingPage('added', 'Handled');
  const added = await headingPage('added', 'Added step');
  function headingOk(info, word) {
    return info && info.text === word && info.display !== 'none' && info.visibility !== 'hidden' &&
      parseFloat(info.opacity) > 0.5 && parseFloat(info.fontSize) >= 10 &&
      info.width > 8 && info.height > 4 && lum(info.color) > 0.5 && info.innerHeading == null;
  }
  check('a one-card Do It list shows a visible Suggested heading', headingOk(suggested, 'Suggested'), suggested);
  check('a one-card Handled list with no step list shows a visible Added heading', headingOk(handled, 'Added'), handled);
  check('a one-card Added list with no step list shows a visible Added heading', headingOk(added, 'Added'), added);
  check('the heading ink stays the popup light color under a light OS theme',
    suggested && /E9EDF6/i.test(suggested.ink) && lum(suggested.color) > 0.5 && lum(added.color) > 0.5,
    { ink: suggested && suggested.ink, suggested: suggested && suggested.color, added: added && added.color });

  await browser.close();
  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
