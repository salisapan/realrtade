// "Stay on this" from anywhere, and Outlook mail through Graph: both turn into the same loops everything else does.
// Run: node test/capture-corpus.cjs
const { FlowCapture: K } = require('../core/capture.js');
const { FlowGraphMail: G } = require('../core/graph-mail.js');
const { FlowFollowUp: F } = require('../core/follow-up.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date(2026, 9, 3, 12).getTime();

console.log('\n--- a selection from any page ---\n');
{
  check('the address is kept without its query or fragment (they often carry tokens)', K.cleanUrl('https://app.slack.com/client/T1/C2/?token=xoxp-secret&x=1#frag') === 'https://app.slack.com/client/T1/C2', K.cleanUrl('https://app.slack.com/client/T1/C2/?token=xoxp-secret#frag'));
  check('only http(s) pages count', K.cleanUrl('javascript:alert(1)') === null && K.cleanUrl('chrome://settings') === null && K.cleanUrl('file:///etc/passwd') === null && K.cleanUrl('not a url') === null && K.cleanUrl(null) === null);
  check('the host is the page\'s own name, without www', K.hostOf('https://www.linkedin.com/messaging/thread/2-abc') === 'linkedin.com' && K.hostOf('') === null);
  check('a selection too short to be a request is refused', K.cleanSelection('ok thanks') === null && K.cleanSelection('   ') === null && K.cleanSelection(null) === null);
  check('whitespace is collapsed and long text is bounded', K.cleanSelection('Can you   send\nthe lease\tplease?') === 'Can you send the lease please?' && K.cleanSelection('word '.repeat(300)).length <= K.MAX_CHARS);
  const p = K.pending({ text: 'Can you send me the signed lease by Friday?', pageUrl: 'https://app.slack.com/client/T1/C2?token=abc' }, NOW);
  check('what the right-click stores: the sentence, the clean address, the host, the time; nothing else', p && p.text.startsWith('Can you send') && p.url === 'https://app.slack.com/client/T1/C2' && p.host === 'app.slack.com' && p.at === NOW && Object.keys(p).sort().join() === 'at,host,text,url', p);
  check('a stale selection is not offered a day later', K.fresh(p, NOW + 1000) && !K.fresh(p, NOW + 25 * 3600 * 1000) && !K.fresh(null, NOW));
  check('a refused selection stores nothing', K.pending({ text: 'ok', pageUrl: 'https://x.com' }, NOW) === null);
}

console.log('\n--- what the answer becomes ---\n');
{
  const p = K.pending({ text: 'Can you send me the signed lease by Friday?', pageUrl: 'https://app.slack.com/client/T1/C2?token=abc' }, NOW);
  const wait = K.toLoop(p, { who: ' Dana  Cole ', mine: false }, NOW);
  check('waiting on someone: a reply loop, on the capture tier, by hand', wait && wait.ask.direction === 'theirs' && wait.ask.kind === 'reply' && wait.ask.tier === 'capture', wait && wait.ask);
  check('it knows the page, the person\'s name (no address) and that it is not an email or a chat', wait.base.channel === 'web' && wait.base.counterpart.name === 'Dana Cole' && wait.base.counterpart.email === null && wait.base.threadUrl === 'https://app.slack.com/client/T1/C2' && wait.base.subject === 'app.slack.com', wait.base);
  check('the same selection gives the same thread id (so it is never opened twice)', K.toLoop(p, { who: 'x' }, NOW).base.threadId === wait.base.threadId && /^web:/.test(wait.base.threadId));
  const owe = K.toLoop(p, { mine: true }, NOW);
  check('"I owe this": a loop of yours', owe && owe.ask.direction === 'mine' && owe.base.counterpart.name === null, owe && owe.ask);
  const watch = F.buildWatch(Object.assign({ ask: wait.ask, now: NOW }, wait.base));
  check('buildWatch accepts it: a waiting loop on the web channel', watch.status === 'waiting' && watch.channel === 'web' && watch.counterpart.phone === null && watch.id === wait.base.threadId, watch);
  check('no name typed is fine', K.toLoop(p, { who: '' }, NOW).base.counterpart.name === null);
  check('nothing from the page but the selection is in the loop', !/token|xoxp|abc/.test(JSON.stringify(watch)), watch);
  check('Hebrew selections get Hebrew copy', K.toLoop(K.pending({ text: 'אפשר לשלוח לי את החוזה החתום עד יום חמישי?', pageUrl: 'https://web.telegram.org/a/' }, NOW), {}, NOW).ask.lang === 'he');
}

console.log('\n--- Outlook mail from Microsoft Graph ---\n');
{
  const me = 'me@contoso.com';
  const html = '<html><body><p>Hi Dana,</p><p>Could you send me the signed lease by Friday?&nbsp;Thanks &amp; regards</p><div><b>From:</b> Dana Cole<br><b>Sent:</b> Monday</div><p>old stuff that must not count</p></body></html>';
  const out = G.toUtterance({ id: 'AAMk1', conversationId: 'AAQk9', subject: 'Lease', isDraft: false, from: { emailAddress: { name: 'Me', address: 'Me@Contoso.com' } }, toRecipients: [{ emailAddress: { name: 'Dana Cole', address: 'dana@acme.com' } }], sentDateTime: '2026-10-01T09:00:00Z', body: { contentType: 'html', content: html } }, me);
  check('an HTML message becomes text, in your own words only', out && /Could you send me the signed lease by Friday\? Thanks & regards/.test(out.text) && !/old stuff|Sent:/.test(out.text), out && out.text);
  check('it is yours (direction out) when the sender is the mailbox owner, case-insensitively', out && out.direction === 'out' && out.channel === 'outlook' && out.thread === 'AAQk9' && out.id === 'AAMk1' && out.ts === Date.parse('2026-10-01T09:00:00Z'), out);
  const inc = G.toUtterance({ id: 'AAMk2', conversationId: 'AAQk9', from: { emailAddress: { name: 'Dana Cole', address: 'dana@acme.com' } }, receivedDateTime: '2026-10-02T09:00:00Z', body: { contentType: 'text', content: 'Confirmed, sending it today.\n\nOn Mon, Oct 1, 2026 at 9:00 AM Me <me@contoso.com> wrote:\n> Could you send me the lease?' } }, me);
  check('their reply: the quoted history is cut at "On … wrote:"', inc && inc.direction === 'in' && inc.text === 'Confirmed, sending it today.' && inc.from.email === 'dana@acme.com', inc);
  const he = G.toUtterance({ id: 'x', conversationId: 'c', from: { emailAddress: { name: 'דנה', address: 'dana@acme.com' } }, body: { contentType: 'text', content: 'שלחתי לך את החוזה.\n\nמאת: אני\nנשלח: יום שני' } }, me);
  check('a Hebrew header cuts the history too', he && he.text === 'שלחתי לך את החוזה.', he);
  check('a draft is never read', G.toUtterance({ id: 'd', isDraft: true, from: { emailAddress: { address: 'me@contoso.com' } }, body: { contentType: 'text', content: 'unsent' } }, me) === null);
  check('a message with no usable sender is dropped', G.toUtterance({ id: 'z', from: { emailAddress: { name: 'x', address: 'nope' } }, body: { contentType: 'text', content: 'hello there' } }, me) === null && G.toUtterance(null, me) === null);
  check('scripts and styles in the HTML are not text', !/alert|color/.test(G.htmlToText('<style>p{color:red}</style><script>alert(1)</script><p>Hello</p>')) && G.htmlToText('<p>A</p><p>B</p>') === 'A\nB');
  const who = G.counterpartOf([{ from: { emailAddress: { name: 'Me', address: me } }, toRecipients: [{ emailAddress: { name: 'Dana Cole', address: 'dana@acme.com' } }] }], me);
  check('the other person of a conversation is found, not you', who && who.email === 'dana@acme.com' && who.name === 'Dana Cole' && who.channel === 'outlook', who);
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
