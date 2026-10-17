const { ME } = require('./sentences');

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The live Gmail self-sent shape. The address is on the sender chip
// (email and data-hovercard-id). The recipient is a span whose text is
// "to me" or אליי, and that chip has no email attribute. The page title
// is not an address. The account button is.
function gmailLiveSelf(o) {
  const own = o.ownEmail || 'ai.local.flow@gmail.com';
  const name = o.senderName || 'Sali Sapan';
  const subject = o.subject || 'Reminder';
  const body = o.body || '';
  const messageId = o.messageId || 'm-live-self';
  const threadId = o.threadId || 't-live-self';
  const langAttr = o.lang ? (' lang="' + esc(o.lang) + '"') : '';
  const account = accountButton(o, own, name);
  const titleEmail = o.titleEmail || own;
  return '<!doctype html><html' + langAttr + '><head><title>Inbox - ' + esc(titleEmail) + ' - Gmail</title></head><body>' +
    account +
    '<div role="main">' +
    '<h2 class="hP">' + esc(subject) + '</h2>' +
    '<div role="listitem" data-legacy-thread-id="' + esc(threadId) + '" data-legacy-message-id="' + esc(messageId) + '">' +
    '<h3 class="iw"><span class="gD" email="' + esc(own) + '" name="' + esc(name) + '" data-hovercard-id="' + esc(own) + '">' + esc(name) + '</span></h3>' +
    '<span class="hb">' + (o.toSelfText === 'אליי' ? '' : 'to ') + '<span class="g2">' + esc(o.toSelfText || 'me') + '</span></span>' +
    '<div class="a3s">' + esc(body) + '</div>' +
    '</div></div></body></html>';
}

function accountButton(o, ownEmail, name) {
  if (o.accountLabel === false || o.omitAccount === true) return '';
  const who = String(name || '').trim();
  // An address with no person. "Glance" is not a loaded name, so a
  // greeting with no profile still waits. Callers that have a name pass it.
  const label = o.accountLabel || ('Google Account: ' + (who ? who + ' ' : '') + '(' + ownEmail + ')');
  return '<a class="gb_d" aria-label="' + esc(label) + '" href="https://accounts.google.com/SignOutOptions"></a>';
}

function gmailHtml(opts) {
  const o = opts || {};
  if (o.liveSelf) return gmailLiveSelf(o);
  const senderEmail = o.senderEmail || 'dana@acme.com';
  const senderName = o.senderName || 'Dana';
  const subject = o.subject || 'Hello';
  const body = o.body || '';
  const messageId = o.messageId || 'm-1';
  const threadId = o.threadId || 't-1';
  const toList = Array.isArray(o.to) ? o.to : [];
  const ccList = Array.isArray(o.cc) ? o.cc : [];
  const ownEmail = o.ownEmail || 'me@x.com';
  const files = Array.isArray(o.attachments) ? o.attachments : [];
  const toLine = toList.length ? ('<div class="to">To: ' + toList.map((a) => '<span email="' + esc(a) + '">' + esc(a) + '</span>').join(' ') + '</div>') : '';
  const ccLine = ccList.length ? ('<div class="cc">Cc: ' + ccList.map((a) => '<span email="' + esc(a) + '">' + esc(a) + '</span>').join(' ') + '</div>') : '';
  const chips = files.map((f) => {
    const name = (f && (f.name || f.filename)) || 'report.pdf';
    const mime = (f && f.mimeType) || 'application/pdf';
    const url = (f && f.url) || ('https://mail.google.com/mail/u/0/?view=att&disp=safe&name=' + encodeURIComponent(name));
    return '<span download_url="' + esc(mime + ':' + name + ':' + url) + '">' + esc(name) + '</span>';
  }).join('');
  const file = o.downloadUrl
    ? ('<span download_url="' + esc(o.downloadUrl) + '"></span>')
    : '';
  const compose = o.composeReply
    ? ('<form><textarea name="to">' + esc(o.composeTo || senderEmail) + '</textarea>' +
      '<input name="subjectbox" value="' + esc(o.composeSubject || ('Re: ' + subject)) + '">' +
      '<div aria-label="Message Body" contenteditable="true" role="textbox"><br>' +
      '<div class="gmail_signature">' + esc(o.signature || 'Best, Ada') + '</div>' +
      '<div class="gmail_quote">On Thursday Flow wrote:<blockquote>' + esc(o.quoted || body) + '</blockquote></div>' +
      '</div></form>')
    : (o.compose
      ? ('<form><textarea name="to"></textarea><input name="subjectbox" value="">' +
        '<div aria-label="Message Body" contenteditable="true" role="textbox"></div></form>')
      : '');
  const message = '<div class="' + (o.threadBesideInbox ? 'adn' : '') + '" role="' + (o.threadBesideInbox ? 'article' : 'listitem') + '" data-legacy-thread-id="' + esc(threadId) + '" data-legacy-message-id="' + esc(messageId) + '">' +
    '<span email="' + esc(senderEmail) + '" name="' + esc(senderName) + '">' + esc(senderName) + '</span>' +
    '<span email="' + esc(ownEmail) + '"' + (o.userName ? (' name="' + esc(o.userName) + '"') : '') + '>me</span>' +
    toLine + ccLine + chips +
    '<div class="a3s">' + esc(body) + '</div>' +
    file +
    '</div>';
  // The inbox list stays in the page when a thread opens. Those rows are
  // listitems and they have no message body. The open mail is not one of them.
  const inbox = o.threadBesideInbox
    ? '<div role="list"><div role="listitem" data-legacy-thread-id="inbox-other"><span class="y2">older snippet</span></div></div>'
    : '';
  const langAttr = o.lang ? (' lang="' + esc(o.lang) + '"') : '';
  const account = accountButton(o, ownEmail, o.accountName || '');
  const titleEmail = o.titleEmail || ownEmail;
  return '<!doctype html><html' + langAttr + '><head><title>Inbox - ' + esc(titleEmail) + ' - Gmail</title></head><body>' +
    account +
    '<div role="main">' +
    inbox +
    '<h2 class="hP">' + esc(subject) + '</h2>' +
    message + compose + '</div></body></html>';
}

function outlookHtml(opts) {
  const o = opts || {};
  const senderEmail = o.senderEmail || 'ai.local.flow@gmail.com';
  const senderName = o.senderName || 'flow';
  const subject = o.subject || 'Hello';
  const body = o.body || '';
  const title = senderName + ' <' + senderEmail + '>';
  const toList = Array.isArray(o.to) ? o.to : [ME];
  const ccList = Array.isArray(o.cc) ? o.cc : [];
  const files = Array.isArray(o.attachments) ? o.attachments : [];
  const received = o.received && !o.live ? '<div class="received" data-received="' + esc(o.received) + '"></div>' : '';
  // A conversation id in the address counts only when the open mail's header
  // shows that same id. The fixture header carries it, the way a confirmed
  // reading pane does.
  const convId = o.id && /^A[AQ]Qk/i.test(String(o.id)) ? String(o.id) : '';
  const convAttr = convId ? (' data-convid="' + esc(convId) + '"') : '';
  const clock = o.live && o.receivedLabel
    ? ('<div class="date">' + esc(o.receivedLabel) + '</div>')
    : '';
  const fileRows = files.map((f) => {
    const name = f && (f.name || f.filename) || '';
    const size = f && f.size != null ? f.size : '';
    if (o.live) {
      const label = (f && (f.sizeLabel || f.sizeText)) || '';
      const shown = (f && f.shownName) || name;
      const title = (f && f.titleName) || '';
      const titleAttr = title ? (' title="' + esc(title) + '" aria-label="' + esc(title) + '"') : '';
      return '<div role="group" aria-label="Attachments"><div role="option" class="attachmentChip"' + titleAttr + '><span>' + esc(shown) + '</span><span>' + esc(label) + '</span></div></div>';
    }
    return '<div class="attachment" data-name="' + esc(name) + '" data-size="' + esc(size) + '">' + esc(name) + '</div>';
  }).join('');
  const unread = o.unread
    ? '<div role="list"><div role="listitem" class="unread" aria-label="לא נקרא">לא נקרא</div></div>'
    : '';
  const ccLine = ccList.length
    ? (o.hebrewCc
      ? ('<div class="cc"><span>עותק</span> <span title="' + esc(ccList[0]) + '">' + esc(o.ccName || ccList[0]) + '</span></div>')
      : ('<div class="cc">Cc: ' + ccList.map((a) => '<span>' + esc(a) + '</span>').join(', ') + '</div>'))
    : '';
  const toLine = o.toLabelSibling
    ? ('<div class="to"><span>To:</span> <span title="' + esc(toList[0] || '') + '" aria-label="sali sapan">sali sapan</span></div>')
    : (o.hebrewToInline
      ? ('<div class="to">אל <span title="' + esc(toList[0] || '') + '">' + esc(o.toName || 'sali sapan') + '</span></div>')
      : (o.hebrewTo
        ? ('<div class="to"><span>אל</span> <span title="' + esc(toList[0] || '') + '">' + esc(o.toName || 'sali sapan') + '</span></div>')
        : ('<div class="to">To: ' + toList.map((a) => '<span>' + esc(a) + '</span>').join(', ') + '</div>')));
  return '<!doctype html><html lang="' + esc(o.lang || 'en') + '"><head><title>Mail - Glance - Outlook</title></head><body>' +
    '<div id="app"><div role="main">' +
    unread +
    '<div id="ReadingPaneContainerId">' +
    '<div role="heading" aria-level="2"><span title="' + esc(subject) + '">' + esc(subject) + '</span></div>' +
    '<div class="hdr"' + convAttr + '><span title="' + esc(title) + '">' + esc(senderName) + '</span>' +
    received +
    clock +
    toLine +
    ccLine +
    fileRows +
    '</div>' +
    '<div role="document">' + (o.translateBanner ? '<p>הודעה זו נמצאת ב-אנגלית</p>' : '') + esc(body).replace(/\n/g, '<br>') + '</div>' +
    '</div></div></div></body></html>';
}

function outlookUrl(id) {
  return 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(id);
}

function gmailUrl(messageId, accountIndex) {
  const n = accountIndex == null || accountIndex === '' ? '0' : String(accountIndex);
  return 'https://mail.google.com/mail/u/' + n + '/#inbox/' + encodeURIComponent(messageId || 'm-1');
}

// The day the date-bound fixtures live on: today, local time. Fixtures that said 2026-10-08 stopped matching the extension's own
// recency checks once that day passed (gate-0945 and gate-0947 failed from the next day on). The Hebrew letter is the weekday
// (א ראשון … ו שישי, ש שבת) as the OWA list row shows it before the date.
function testDay() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const d = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  d.dmy = pad(d.d) + '/' + pad(d.m) + '/' + d.y;
  d.heDay = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'][now.getDay()];
  return d;
}

module.exports = { gmailHtml, outlookHtml, outlookUrl, gmailUrl, testDay };
