const { ME } = require('./sentences');

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function gmailHtml(opts) {
  const o = opts || {};
  const senderEmail = o.senderEmail || 'dana@acme.com';
  const senderName = o.senderName || 'Dana';
  const subject = o.subject || 'Hello';
  const body = o.body || '';
  const messageId = o.messageId || 'm-1';
  const threadId = o.threadId || 't-1';
  const toList = Array.isArray(o.to) ? o.to : [];
  const ccList = Array.isArray(o.cc) ? o.cc : [];
  const toLine = toList.length ? ('<div class="to">To: ' + toList.map((a) => '<span email="' + esc(a) + '">' + esc(a) + '</span>').join(' ') + '</div>') : '';
  const ccLine = ccList.length ? ('<div class="cc">Cc: ' + ccList.map((a) => '<span email="' + esc(a) + '">' + esc(a) + '</span>').join(' ') + '</div>') : '';
  return '<!doctype html><html><head><title>Inbox - me@x.com - Gmail</title></head><body>' +
    '<div role="main">' +
    '<h2 class="hP">' + esc(subject) + '</h2>' +
    '<div role="listitem" data-legacy-thread-id="' + esc(threadId) + '" data-legacy-message-id="' + esc(messageId) + '">' +
    '<span email="' + esc(senderEmail) + '" name="' + esc(senderName) + '">' + esc(senderName) + '</span>' +
    '<span email="me@x.com"' + (o.userName ? (' name="' + esc(o.userName) + '"') : '') + '>me</span>' +
    toLine + ccLine +
    '<div class="a3s">' + esc(body) + '</div>' +
    '</div></div></body></html>';
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
  const toLine = o.hebrewToInline
    ? ('<div class="to">אל <span title="' + esc(toList[0] || '') + '">' + esc(o.toName || 'sali sapan') + '</span></div>')
    : (o.hebrewTo
      ? ('<div class="to"><span>אל</span> <span title="' + esc(toList[0] || '') + '">' + esc(o.toName || 'sali sapan') + '</span></div>')
      : ('<div class="to">To: ' + toList.map((a) => '<span>' + esc(a) + '</span>').join(', ') + '</div>'));
  return '<!doctype html><html lang="en"><head><title>Mail - Glance - Outlook</title></head><body>' +
    '<div id="app"><div role="main">' +
    unread +
    '<div id="ReadingPaneContainerId">' +
    '<div role="heading" aria-level="2"><span title="' + esc(subject) + '">' + esc(subject) + '</span></div>' +
    '<div class="hdr"><span title="' + esc(title) + '">' + esc(senderName) + '</span>' +
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

function gmailUrl(messageId) {
  return 'https://mail.google.com/mail/u/0/#inbox/' + encodeURIComponent(messageId || 'm-1');
}

module.exports = { gmailHtml, outlookHtml, outlookUrl, gmailUrl };
