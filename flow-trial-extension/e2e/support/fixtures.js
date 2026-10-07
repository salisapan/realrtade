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
  return '<!doctype html><html><head><title>Inbox - me@x.com - Gmail</title></head><body>' +
    '<div role="main">' +
    '<h2 class="hP">' + esc(subject) + '</h2>' +
    '<div role="listitem" data-legacy-thread-id="' + esc(threadId) + '" data-legacy-message-id="' + esc(messageId) + '">' +
    '<span email="' + esc(senderEmail) + '" name="' + esc(senderName) + '">' + esc(senderName) + '</span>' +
    '<span email="me@x.com">me</span>' +
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
  return '<!doctype html><html lang="en"><head><title>Mail - Glance - Outlook</title></head><body>' +
    '<div id="app"><div role="main">' +
    '<div id="ReadingPaneContainerId">' +
    '<div role="heading" aria-level="2"><span title="' + esc(subject) + '">' + esc(subject) + '</span></div>' +
    '<div class="hdr"><span title="' + esc(title) + '">' + esc(senderName) + '</span>' +
    '<div class="to">To: <span>' + esc(ME) + '</span></div></div>' +
    '<div role="document">' + esc(body).replace(/\n/g, '<br>') + '</div>' +
    '</div></div></div></body></html>';
}

function outlookUrl(id) {
  return 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(id);
}

function gmailUrl(messageId) {
  return 'https://mail.google.com/mail/u/0/#inbox/' + encodeURIComponent(messageId || 'm-1');
}

module.exports = { gmailHtml, outlookHtml, outlookUrl, gmailUrl };
