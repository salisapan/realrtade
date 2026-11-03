#!/usr/bin/env node
// Behavior tests for the Outlook add-in task pane. They drive the real taskpane.js and thread.js in a vm sandbox with a
// fake Office host, a fake DOM and a fake Microsoft Graph. No browser, no network, no Outlook.
//
// Fixed NOW so no result depends on the day or the time zone the test runs in.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const SRC = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const BUNDLE = path.join(root, 'dist', 'core-bundle.js');
if (!fs.existsSync(BUNDLE)) require('../scripts/build-bundle.js');
const BUNDLE_SRC = fs.readFileSync(BUNDLE, 'utf8');
const MANIFEST = fs.readFileSync(path.join(root, 'manifest.xml'), 'utf8');

const NOW_MS = Date.parse('2026-10-15T09:00:00Z');
const GRAPH = 'https://graph.microsoft.com/v1.0';
const CONV = 'AAQkConv-1_x'; // Graph form
const CONV_EWS = 'AAQkConv+1/x'; // Office.js form: same bytes, other alphabet
const ME = 'sali@example.com';
const ASK = 'Hi Sali, could you reply to confirm you will be at the review on Thursday morning? Please let me know by Wednesday.';
const OLD_ASK = 'Hi Sali, please send me the budget notes before the call.';

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

// ---------- fake DOM ----------
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this._text = ''; this.type = ''; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(' '); }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...kids) { this.children = kids; this._text = ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  all() { return [this].concat(...this.children.map((c) => c.all())); }
  button(action) { return this.all().find((n) => n.tag === 'button' && n.attrs['data-glance-action'] === action) || null; }
  click() { (this.listeners.click || []).forEach((f) => f()); }
}
const settle = () => new Promise((r) => setImmediate(r));
async function settleAll() { for (let i = 0; i < 5; i++) await settle(); }

// ---------- fake compose body ----------
function textOf(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|blockquote)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function makeBody(initialHtml, faults, writes) {
  const body = { html: initialHtml };
  const done = (cb, value, ok) => cb({ status: ok ? 'succeeded' : 'failed', value });
  body.getAsync = (type, cb) => {
    writes.bodyReads++;
    if (faults.readFails) return done(cb, null, false);
    done(cb, type === 'html' ? body.html : textOf(body.html), true);
  };
  body.prependAsync = (html, opts, cb) => {
    writes.prepend++;
    if (faults.refuseWrites) return done(cb, null, false);
    if (!faults.dropWrites) body.html = html + body.html;
    done(cb, undefined, true);
  };
  body.setAsync = (html, opts, cb) => {
    writes.set++;
    if (faults.refuseWrites) return done(cb, null, false);
    if (!faults.dropWrites) body.html = html;
    done(cb, undefined, true);
  };
  return body;
}

// ---------- fake Graph ----------
function msg(id, who, iso, text, extra) {
  const mine = who === 'me';
  return Object.assign({
    id, conversationId: CONV, subject: 'Review',
    from: { emailAddress: { name: mine ? 'Sali Sapan' : 'Dana Cohen', address: mine ? ME : 'dana@client.example' } },
    receivedDateTime: iso, isDraft: false, body: { contentType: 'text', content: text }
  }, extra || {});
}
function defaultThread() {
  return [
    msg('m1', 'dana', '2026-10-12T08:00:00Z', 'Hi Sali, the numbers are in the shared folder. Kind regards, Dana.'),
    msg('m2', 'dana', '2026-10-13T08:00:00Z', OLD_ASK),
    msg('m3', 'me', '2026-10-13T09:00:00Z', 'Thanks Dana, I will take a look.'),
    msg('m4', 'dana', '2026-10-14T10:00:00Z', ASK)
  ];
}

function makeGraph(o, calls) {
  const messages = o.messages;
  const serverPage = o.serverPage || 2;
  let n = 0;
  const json = (status, body) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });
  return function fetch(url, init) {
    n++;
    const method = (init && init.method) || 'GET';
    calls.push({ method, url: String(url), headers: (init && init.headers) || {} });
    if (o.networkDown) return Promise.reject(new Error('offline'));
    const nth = calls.length;
    if (o.failCall && o.failCall(nth, String(url))) return json(o.failStatus || 500, {});
    const u = String(url);
    let m = /\/me\/messages\/([^?]+)\?/.exec(u);
    if (m) {
      const found = messages.find((x) => x.id === decodeURIComponent(m[1]));
      const wantId = decodeURIComponent(m[1]);
      if (found) return json(200, { id: found.id, conversationId: o.itemConversation === undefined ? found.conversationId : o.itemConversation });
      return o.itemConversation !== undefined ? json(200, { id: wantId, conversationId: o.itemConversation }) : json(404, {});
    }
    if (u.indexOf('/me/messages?') !== -1) {
      const skip = Number((/\$skiptoken=(\d+)/.exec(u) || [0, 0])[1]);
      const filter = decodeURIComponent((/\$filter=([^&]+)/.exec(u) || [0, ''])[1]);
      const want = (/conversationId eq '([^']*)'/.exec(filter) || [0, ''])[1];
      let pool = o.ignoreFilter ? messages : messages.filter((x) => x.conversationId.replace(/[+]/g, '-').replace(/\//g, '_') === want);
      if (o.synthetic) pool = o.synthetic;
      const order = o.shuffle ? pool.slice().reverse() : pool;
      const slice = order.slice(skip, skip + serverPage);
      const out = { value: slice };
      if (skip + serverPage < order.length) out['@odata.nextLink'] = GRAPH + '/me/messages?$skiptoken=' + (skip + serverPage) + '&$filter=' + encodeURIComponent(filter);
      return json(200, out);
    }
    return json(404, {});
  };
}

// ---------- a whole pane run ----------
const SEND = /send/i;
async function scenario(o) {
  o = Object.assign({ mode: 'read', messages: defaultThread(), token: 'tok', paneSrc: SRC('taskpane.js'), threadSrc: SRC('thread.js'),
    priorHtml: '<div></div><blockquote>On Tue Dana wrote: ' + ASK + '</blockquote>', faults: {} }, o);
  const calls = []; const trip = []; const writes = { prepend: 0, set: 0, bodyReads: 0 };
  const body = makeBody(o.priorHtml, o.faults, writes);
  const guard = (target, label) => new Proxy(target, {
    get(t, p) {
      if (typeof p === 'string' && SEND.test(p)) { trip.push(label + '.' + p); throw new Error('send is not reachable: ' + p); }
      return t[p];
    }
  });
  const raw = o.mode === 'compose'
    ? { subject: { getAsync: (cb) => cb({ status: 'succeeded', value: 'Re: Review' }) }, conversationId: o.noConversation ? '' : CONV_EWS, body }
    : { itemId: 'EWS:m4', conversationId: CONV_EWS, subject: 'Review', from: { emailAddress: 'dana@client.example', displayName: 'Dana' }, body };
  const item = guard(raw, 'item');
  const mailbox = guard({ item, userProfile: { emailAddress: ME, displayName: 'Sali Sapan' }, convertToRestId: (id) => String(id).replace(/^EWS:/, '') }, 'mailbox');
  const Office = {
    onReady: (cb) => cb({ host: 'Outlook' }),
    AsyncResultStatus: { Succeeded: 'succeeded', Failed: 'failed' },
    CoercionType: { Html: 'html', Text: 'text' },
    MailboxEnums: { RestVersion: { v2_0: 'v2.0' } },
    context: { mailbox }
  };
  const rootNode = new Node('main');
  const document = { createElement: (t) => new Node(t), getElementById: () => rootNode };
  class FixedDate extends Date {
    constructor(...a) { if (a.length === 0) super(NOW_MS); else super(...a); }
    static now() { return NOW_MS; }
  }
  const sandbox = { console, Office, document, Date: FixedDate, fetch: makeGraph(o, calls) };
  if (o.token !== null) sandbox.GlanceOutlookAuth = { getToken: o.tokenFn || (() => Promise.resolve(o.token)) };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(BUNDLE_SRC, sandbox, { filename: 'core-bundle.js' });
  vm.runInContext(o.threadSrc, sandbox, { filename: 'thread.js' });
  vm.runInContext(o.paneSrc, sandbox, { filename: 'taskpane.js' });
  await sandbox.GlanceOutlookPane.ready;
  await settleAll();
  const state = () => rootNode.attrs['data-glance-state'];
  return { root: rootNode, calls, trip, writes, body, state, why: () => rootNode.attrs['data-glance-why'], text: () => rootNode.textContent };
}

const nonGet = (s) => s.calls.filter((c) => c.method !== 'GET' || SEND.test(c.url));
const noWriteYet = (s) => s.writes.prepend === 0 && s.writes.set === 0;

// The send-mutation throws inside a promise on purpose; only that one is expected.
process.on('unhandledRejection', (e) => { if (!/send is not reachable/.test(String(e && e.message))) { console.error(e); process.exit(1); } });

(async () => {
  // 1. A real ask shows a card. Read mode: card, no write button, nothing written.
  {
    const s = await scenario({ mode: 'read' });
    check('real ask: a card shows', s.state() === 'card', [s.state(), s.why()]);
    check('real ask: the card says it read all 4 messages', /Read 4 messages/.test(s.text()), s.text());
    check('real ask: the draft is for the newest ask, not the older one', /review on Thursday morning/.test(s.text()) && !/budget notes/.test(s.text()), s.text());
    check('read pane: no write button', s.root.button('insert') === null && s.root.button('undo') === null);
    check('read pane: nothing written', noWriteYet(s) && s.writes.bodyReads === 0, s.writes);
  }

  // 2. The full thread is read: every page, by conversation, never $top=1; newest wins even when it is on the last page.
  {
    const s = await scenario({ mode: 'read', shuffle: true });
    const listCalls = s.calls.filter((c) => c.url.indexOf('/me/messages?') !== -1);
    check('full thread: all 2 pages were requested', listCalls.length === 2, listCalls.map((c) => c.url));
    check('full thread: filtered by the conversation id', listCalls.every((c) => decodeURIComponent(c.url).indexOf("conversationId eq '" + CONV + "'") !== -1));
    check('full thread: no $top=1 anywhere', s.calls.every((c) => !/\$top=1(&|$)/.test(c.url)), s.calls.map((c) => c.url));
    check('full thread: asks for the body as text', s.calls.every((c) => /outlook\.body-content-type="text"/.test(c.headers.Prefer || '')));
    check('full thread: newest message on the last page decides the card', s.state() === 'card' && /review on Thursday morning/.test(s.text()), s.text());
    const mineLast = defaultThread().concat([msg('m5', 'me', '2026-10-14T12:00:00Z', 'Confirmed, I will be there Thursday morning.')]);
    const q = await scenario({ mode: 'read', messages: mineLast });
    check('full thread: my later reply on the last page keeps it quiet, with a why',
      q.state() === 'quiet' && q.why() === 'last-message-is-mine' && /Why:/.test(q.text()), [q.state(), q.why()]);
    const compose = await scenario({ mode: 'compose', shuffle: true });
    check('full thread: compose reads by the conversation id (EWS form turned into Graph form)',
      compose.calls.some((c) => decodeURIComponent(c.url).indexOf("conversationId eq '" + CONV + "'") !== -1) && compose.state() === 'card', [compose.state(), compose.why()]);
  }

  // 3. The thread is unreadable: no card, with a why. Never a latest-message fallback.
  {
    const cases = [
      ['no sign-in (no token source)', { token: null }, 'no-token'],
      ['token source fails', { tokenFn: () => Promise.reject(new Error('x')) }, 'no-token'],
      ['token source throws', { tokenFn: () => { throw new Error('x'); } }, 'no-token'],
      ['empty token', { token: '' }, 'no-token'],
      ['the open message cannot be looked up (401)', { failCall: (n) => n === 1, failStatus: 401 }, 'http-401'],
      ['page 2 fails (500)', { failCall: (n) => n === 3 }, 'http-500'],
      ['page 1 fails (429)', { failCall: (n) => n === 2, failStatus: 429 }, 'http-429'],
      ['network down', { networkDown: true }, 'network'],
      ['the filter is ignored and another conversation comes back', { ignoreFilter: true, messages: defaultThread().concat([msg('x1', 'dana', '2026-10-14T11:00:00Z', ASK, { conversationId: 'OtherConv' })]) }, 'wrong-conversation'],
      ['the open message is not in the thread', { messages: defaultThread().filter((m) => m.id !== 'm4').concat([Object.assign(msg('m9', 'dana', '2026-10-14T10:00:00Z', ASK), {})]) , itemConversation: CONV }, 'item-missing'],
      ['the thread is empty', { messages: [msg('m4', 'dana', '2026-10-14T10:00:00Z', ASK, { isDraft: true })], itemConversation: CONV }, 'empty'],
      ['a message has no readable body', { messages: defaultThread().map((m) => (m.id === 'm2' ? Object.assign({}, m, { body: null }) : m)) }, 'unreadable-message'],
      ['the item has no conversation', { itemConversation: null }, 'no-conversation']
    ];
    for (const [label, o, why] of cases) {
      const s = await scenario(Object.assign({ mode: 'read' }, o));
      check('unreadable thread (' + label + '): no card, why ' + why,
        s.state() === 'quiet' && s.why() === why && /Why:/.test(s.text()) && !/review on Thursday/.test(s.text()), [s.state(), s.why()]);
      check('unreadable thread (' + label + '): the open message body was never used as a fallback', s.writes.bodyReads === 0 && noWriteYet(s));
    }
    // Too long to read in full: more pages than the cap.
    const many = [];
    for (let i = 0; i < 40; i++) many.push(msg('p' + i, 'dana', new Date(NOW_MS - (100 - i) * 3600000).toISOString(), 'FYI ' + i));
    many.push(msg('m4', 'dana', '2026-10-14T10:00:00Z', ASK));
    const big = await scenario({ mode: 'read', messages: many, serverPage: 3 });
    check('unreadable thread (more pages than the cap): no card, why incomplete', big.state() === 'quiet' && big.why() === 'incomplete' && big.calls.length <= 12, [big.state(), big.why(), big.calls.length]);
    const noConv = await scenario({ mode: 'compose', noConversation: true });
    check('compose with no conversation (a new message): no card, with a why', noConv.state() === 'quiet' && noConv.why() === 'no-conversation', [noConv.state(), noConv.why()]);
  }

  // 4. Noise is quiet, and says why.
  {
    const promo = defaultThread().concat([msg('m5', 'dana', '2026-10-14T11:00:00Z',
      'Big sale! 50% off everything this weekend only. Unsubscribe here. View in browser. Shop now and save on all our products', { from: { emailAddress: { name: 'Shop', address: 'news@shop.example' } } })]);
    const a = await scenario({ mode: 'read', messages: promo });
    check('noise: a promo is quiet, with a why', a.state() === 'quiet' && /^quiet:/.test(a.why()) && /Why:/.test(a.text()) && !a.root.button('insert'), [a.state(), a.why(), a.text()]);
    const thanks = defaultThread().concat([msg('m5', 'dana', '2026-10-14T11:00:00Z', 'thanks!')]);
    const b = await scenario({ mode: 'read', messages: thanks });
    check('noise: "thanks!" is quiet, with a why', b.state() === 'quiet' && b.why() === 'too-short' && /Why:/.test(b.text()), [b.state(), b.why()]);
    const fyi = defaultThread().concat([msg('m5', 'dana', '2026-10-14T11:00:00Z', 'Hi team, thanks for the update. See you at the offsite next month, looking forward to it.')]);
    const c = await scenario({ mode: 'read', messages: fyi });
    check('noise: an FYI with no ask is quiet, with a why', c.state() === 'quiet' && c.why().length > 0 && /Why:/.test(c.text()), [c.state(), c.why()]);
  }

  // 5. Nothing is written until the click.
  const paneSrc = SRC('taskpane.js');
  {
    const s = await scenario({ mode: 'compose' });
    check('compose: the card shows and the Insert draft button is there', s.state() === 'card' && Boolean(s.root.button('insert')), [s.state(), s.why()]);
    check('compose: opening the pane wrote nothing', noWriteYet(s), s.writes);
    check('compose: opening the pane did not even read the body', s.writes.bodyReads === 0, s.writes);
    check('manifest: no event-based compose activation', !/LaunchEvent|OnNewMessageCompose|<Runtimes|<Runtime |FunctionFile/.test(MANIFEST));
    check('src: no compose auto-writer file or handler is left',
      !fs.existsSync(path.join(root, 'src', 'compose-launch.js')) && !fs.existsSync(path.join(root, 'src', 'functions.html')) &&
      fs.readdirSync(path.join(root, 'src')).every((f) => !/onNewMessageCompose|Office\.actions\.associate/.test(SRC(f))));
  }

  // 6. No send is reachable.
  {
    const s = await scenario({ mode: 'compose' });
    s.root.button('insert').click(); await settleAll();
    s.root.button('undo').click(); await settleAll();
    check('no send: the whole flow (open, insert, undo) touched no send member and no non-GET call', s.trip.length === 0 && nonGet(s).length === 0, [s.trip, nonGet(s).map((c) => c.method + ' ' + c.url)]);
    check('no send: every Graph call is a GET to /me/messages', s.calls.length > 0 && s.calls.every((c) => c.method === 'GET' && c.url.indexOf(GRAPH + '/me/messages') === 0));
    check('no send: manifest has no send surface or send event', !/OnMessageSend|OnAppointmentSend|MessageSend/i.test(MANIFEST));
    check('no send: no send call in the pane or the thread reader', ['taskpane.js', 'thread.js'].every((f) => !/\bsend(Mail|Async|Message)?\s*\(|\/send\b|\.send\b|sendMail/i.test(SRC(f).replace(/\/\/.*$/gm, ''))));
  }

  // 7. Every write has proof, read-back and Undo.
  {
    const s = await scenario({ mode: 'compose' });
    const before = s.body.html;
    s.root.button('insert').click(); await settleAll();
    const draftNow = textOf(s.body.html);
    check('write: the click wrote one draft above the quoted thread', s.writes.prepend === 1 && /review on Thursday morning/.test(draftNow) && s.body.html.endsWith(before), s.body.html.slice(0, 120));
    check('write: the body was read back before it said so', s.writes.bodyReads >= 3 && s.state() === 'written', [s.writes, s.state()]);
    check('write: proof line says read back, not sent, not handled', /Read back from this message at 2026-10-15T09:00:00\.000Z\. Not sent\./.test(s.text()) && !/handled|closed|sent to/i.test(s.text().replace('Not sent', '')), s.text());
    check('write: an Undo button is offered', Boolean(s.root.button('undo')));
    s.root.button('undo').click(); await settleAll();
    check('undo: the reply is back exactly as it was, read back', s.body.html === before && s.state() === 'undone' && /back as it was/.test(s.text()), [s.state(), s.body.html.slice(0, 80)]);

    const e = await scenario({ mode: 'compose' });
    e.root.button('insert').click(); await settleAll();
    e.body.html = 'My own words. ' + e.body.html; // the person keeps typing
    const edited = e.body.html;
    e.root.button('undo').click(); await settleAll();
    check('undo: if the person edited after the write, their text is kept and Undo says so', e.body.html === edited && e.state() === 'undo-skipped' && /changed the reply/.test(e.text()), [e.state()]);

    const d = await scenario({ mode: 'compose', faults: { dropWrites: true } });
    d.root.button('insert').click(); await settleAll();
    check('write: if the body does not read back as written, it does not claim success', d.state() === 'write-failed' && d.why() === 'read-back-mismatch' && !/inserted/i.test(d.text()) && !d.root.button('undo'), [d.state(), d.text()]);
    const r = await scenario({ mode: 'compose', faults: { refuseWrites: true } });
    r.root.button('insert').click(); await settleAll();
    check('write: if Outlook refuses the write, it says so and claims nothing', r.state() === 'write-failed' && r.why() === 'write-refused' && !r.root.button('undo'), [r.state(), r.why()]);
    const u = await scenario({ mode: 'compose', faults: {} });
    u.root.button('insert').click(); await settleAll();
    u.body.setAsync = (h, o2, cb) => cb({ status: 'succeeded' }); // Outlook says yes but keeps the draft
    u.root.button('undo').click(); await settleAll();
    check('undo: if the restore does not read back, it says so', u.state() === 'undo-unconfirmed' && /Couldn't confirm Undo/.test(u.text()), [u.state(), u.text()]);
  }

  // 8. Scopes: the add-in declares none of its own and asks for nothing the extension has not declared.
  {
    const cfg = require('../../flow-trial-extension/core/outlook-config.js').FlowOutlookConfig;
    const declared = new Set(cfg.SCOPES.concat(...cfg.CONNECT_SERVICES.map((x) => x.scopes || [])));
    const used = (SRC('thread.js') + SRC('taskpane.js')).match(/\b(Mail|User|Calendars|Files|Sites|Tasks|Contacts|Chat|People|Notes)\.[A-Za-z.]+\b/g) || [];
    check('scopes: the default sign-in scopes are exactly the declared four', JSON.stringify(cfg.SCOPES) === JSON.stringify(['offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite']), cfg.SCOPES);
    check('scopes: every scope named in the add-in source is already declared', used.every((x) => declared.has(x)), used);
    check('scopes: the add-in reads with Mail.Read only and never names Mail.ReadWrite or Mail.Send', !/Mail\.ReadWrite|Mail\.Send/.test(SRC('thread.js') + SRC('taskpane.js')));
    check('scopes: the manifest declares no Graph scope (no WebApplicationInfo / Scopes)', !/WebApplicationInfo|<Scope>|<Scopes>/.test(MANIFEST));
    check('scopes: the declared set has no Mail.Send', !declared.has('Mail.Send'));
  }

  // 9. Manifest identity.
  {
    const id = (/<Id>([^<]+)<\/Id>/.exec(MANIFEST) || [0, ''])[1];
    check('manifest: Id is a real GUID', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id), id);
    check('manifest: Permissions is the one already declared (ReadWriteItem)', /<Permissions>ReadWriteItem<\/Permissions>/.test(MANIFEST));
    check('manifest: read and compose surfaces and mobile read exist', /MessageReadCommandSurface/.test(MANIFEST) && /MessageComposeCommandSurface/.test(MANIFEST) && /MobileMessageReadCommandSurface/.test(MANIFEST));
    check('manifest: no mobile compose surface (Outlook mobile has none)', !/MobileMessageComposeCommandSurface/.test(MANIFEST));
  }

  // 10. The tests above bite: break the code on purpose, and the matching check must notice.
  {
    const autoWrite = paneSrc.replace('renderCard(root, verdict, compose);\n    }).catch', 'renderCard(root, verdict, compose); if (compose) insertDraft(root, verdict.draft);\n    }).catch');
    check('mutation: the auto-write patch applied', autoWrite !== paneSrc);
    const m1 = await scenario({ mode: 'compose', paneSrc: autoWrite });
    check('mutation: writing on open is caught by the no-auto-write check', !noWriteYet(m1));

    const sender = paneSrc.replace('var proof = {', 'item.sendAsync(); var proof = {');
    check('mutation: the send patch applied', sender !== paneSrc);
    const m2 = await scenario({ mode: 'compose', paneSrc: sender });
    m2.root.button('insert').click(); await settleAll();
    check('mutation: reaching for a send member is caught by the tripwire', m2.trip.length > 0, m2.trip);

    const post = SRC('thread.js').replace("method: 'GET'", "method: 'POST'");
    const m3 = await scenario({ mode: 'read', threadSrc: post });
    check('mutation: a non-GET Graph call is caught', nonGet(m3).length > 0);

    const partial = SRC('thread.js').replace('          if (!r.ok) return r;\n          if (!Array.isArray', '          if (!r.ok) return { ok: true, raw: all, conv: conv };\n          if (!Array.isArray');
    check('mutation: the partial-thread patch applied', partial !== SRC('thread.js'));
    const real4 = await scenario({ mode: 'compose', shuffle: true, failCall: (n) => n === 2 });
    check('fail closed: compose, page 2 fails after page 1 held the newest ask: still no card', real4.state() === 'quiet' && real4.why() === 'http-500', [real4.state(), real4.why()]);
    const m4 = await scenario({ mode: 'compose', shuffle: true, threadSrc: partial, failCall: (n) => n === 2 });
    check('mutation: a thread read that swallows a failed page is caught by the fail-closed check', m4.state() === 'card', m4.state());

    const noReadBack = paneSrc.replace('read.indexOf(want) !== 0 || !kept', 'false');
    check('mutation: the read-back patch applied', noReadBack !== paneSrc);
    const m5 = await scenario({ mode: 'compose', paneSrc: noReadBack, faults: { dropWrites: true } });
    m5.root.button('insert').click(); await settleAll();
    check('mutation: skipping the read-back is caught (it claims a write that never landed)', m5.state() === 'written');

    const noGate = paneSrc.replace('normalize(now1.value) !== state.written', 'false');
    check('mutation: the undo-gate patch applied', noGate !== paneSrc);
    const m6 = await scenario({ mode: 'compose', paneSrc: noGate });
    m6.root.button('insert').click(); await settleAll();
    m6.body.html = 'My own words. ' + m6.body.html;
    const kept = m6.body.html;
    m6.root.button('undo').click(); await settleAll();
    check('mutation: an Undo that ignores the person\'s edit is caught', m6.body.html !== kept);
  }

  if (failures) {
    console.error('\n' + failures + ' failed');
    process.exit(1);
  }
  console.log('\nAll outlook add-in behavior checks passed');
})().catch((err) => { console.error(err); process.exit(1); });
