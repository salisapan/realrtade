/* global module, Office */
// Reads the open Outlook item through Office.js mailbox item APIs.
// Body, subject, from, to, cc, and conversationId. No Graph call and no token.
// A compose item is the reply being written: the incoming message is the quoted
// original inside that body. The reply's own To line is not who the ask was addressed to.
(function (root) {
  'use strict';

  function fail(why) { return { ok: false, why: why }; }

  function emailOf(details) {
    if (!details) return '';
    if (typeof details === 'string') {
      var found = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(details);
      return found ? found[0].toLowerCase() : '';
    }
    if (typeof details.emailAddress === 'string') return details.emailAddress.trim().toLowerCase();
    if (details.emailAddress && typeof details.emailAddress === 'object') {
      return String(details.emailAddress.address || '').trim().toLowerCase();
    }
    if (typeof details.address === 'string') return details.address.trim().toLowerCase();
    return '';
  }

  function nameOf(details) {
    if (!details || typeof details === 'string') return null;
    if (details.emailAddress && typeof details.emailAddress === 'object' && details.emailAddress.name) {
      return String(details.emailAddress.name);
    }
    var name = details.displayName || details.name || '';
    name = String(name).trim();
    return name || null;
  }

  function addressList(value) {
    if (!value) return [];
    if (typeof value === 'string') {
      var one = emailOf(value);
      return one ? [one] : [];
    }
    if (!Array.isArray(value)) {
      var single = emailOf(value);
      return single ? [single] : [];
    }
    var out = [];
    for (var i = 0; i < value.length; i++) {
      var email = emailOf(value[i]);
      if (email && out.indexOf(email) < 0) out.push(email);
    }
    return out;
  }

  var NAME_STOP = {
    on: 1, mon: 1, monday: 1, tue: 1, tues: 1, tuesday: 1, wed: 1, wednesday: 1,
    thu: 1, thur: 1, thurs: 1, thursday: 1, fri: 1, friday: 1, sat: 1, saturday: 1,
    sun: 1, sunday: 1, jan: 1, january: 1, feb: 1, february: 1, mar: 1, march: 1,
    apr: 1, april: 1, may: 1, jun: 1, june: 1, jul: 1, july: 1, aug: 1, august: 1,
    sep: 1, sept: 1, september: 1, oct: 1, october: 1, nov: 1, november: 1,
    dec: 1, december: 1, am: 1, pm: 1, at: 1
  };

  function trailingName(words) {
    var name = [];
    for (var i = words.length - 1; i >= 0 && name.length < 3; i--) {
      var word = String(words[i] || '').replace(/[,:]/g, '');
      if (!word || !/^[A-Z]/.test(word) || NAME_STOP[word.toLowerCase()]) break;
      name.unshift(word);
    }
    return name.length ? name.join(' ') : null;
  }

  function looksLikeHtml(value) {
    return /<(?:!doctype|html|body|div|p|br|span|table|font|b|a|hr)\b/i.test(String(value || ''));
  }

  // Office.js on Outlook on the web often returns the message as HTML. The classifier
  // reads plain sentences, so tags are turned into text before any judgment.
  function htmlToText(html) {
    return String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:div|p|tr|li|h[1-6]|blockquote|table)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function plainBody(value) {
    var raw = String(value || '').replace(/\r\n/g, '\n');
    return looksLikeHtml(raw) ? htmlToText(raw) : raw;
  }

  var HEADER_LINE = /^(?:from|sent|to|cc|bcc|subject|date|מאת|נשלח|אל|עותק|נושא|תאריך)\s*:/i;

  // Outlook's reply header is several labelled lines (From/Sent/To/Subject, or the Hebrew
  // מאת/נשלח/אל/נושא). One stray "From:" line in the person's own typing is not this block.
  function headerBlock(plain) {
    var lines = String(plain || '').split('\n');
    var i = 0;
    while (i < lines.length && !String(lines[i] || '').trim()) i++;
    if (i >= lines.length || !HEADER_LINE.test(String(lines[i] || '').trim())) return null;
    var fromLine = '';
    var saw = 0;
    while (i < lines.length) {
      var line = String(lines[i] || '').trim();
      if (!line) { i++; break; }
      if (!HEADER_LINE.test(line)) break;
      if (!fromLine && /^(?:from|מאת)\s*:/i.test(line)) fromLine = line;
      saw++;
      i++;
    }
    if (!fromLine || saw < 1) return null;
    var body = lines.slice(i).join('\n').trim();
    if (!body) return null;
    var name = fromLine.replace(/^(?:from|מאת)\s*:\s*/i, '').replace(/<[^>]*>/g, '').trim();
    return { text: body, fromName: name || null, from: emailOf(fromLine) };
  }

  // The quoted original inside a reply, or null when the body is only the person's own typing.
  // Outlook on the web puts the original after #appendonsend / #divRplyFwdMsg, then a
  // From/Sent/To/Subject block (English or Hebrew). A plain "On … wrote:" quote still counts.
  function quotedIncoming(text) {
    var raw = String(text || '');
    var marker = /id\s*=\s*["']?(?:appendonsend|divRplyFwdMsg)["']?[^>]*>/i.exec(raw);
    var sliced = marker ? raw.slice(marker.index + marker[0].length) : null;
    var plain = plainBody(sliced != null ? sliced : raw);
    if (sliced != null) {
      var marked = headerBlock(plain);
      if (marked) return marked;
      if (plain.trim()) return { text: plain.trim(), fromName: null, from: '' };
    }
    var divider = /(?:^|\n)[_\-]{5,}[ \t]*\n/.exec(plain);
    if (divider) {
      var afterRule = headerBlock(plain.slice(divider.index + divider[0].length));
      if (afterRule) return afterRule;
    }
    var fromAt = /(?:^|\n)(?:from|מאת)\s*:/i.exec(plain);
    var headed = headerBlock(fromAt ? plain.slice(fromAt.index).replace(/^\n/, '') : plain);
    if (headed) return headed;
    var on = /(?:^|\n)On [\s\S]{0,180}?wrote:\s*/i.exec(plain);
    if (on) {
      var body = plain.slice(on.index + on[0].length).trim();
      if (!body) return null;
      return {
        text: body,
        fromName: trailingName(on[0].replace(/wrote:\s*$/i, '').split(/\s+/).filter(Boolean)),
        from: ''
      };
    }
    var orig = /(?:^|\n)-{3,}\s*Original Message\s*-{3,}\s*/i.exec(plain);
    if (orig) {
      var rest = plain.slice(orig.index + orig[0].length).trim();
      var afterOrig = headerBlock(rest) || (rest ? { text: rest, fromName: null, from: '' } : null);
      return afterOrig;
    }
    return null;
  }

  function canonId(id) {
    return String(id || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function draftHtml(draft) {
    return String(draft || '').split(/\r?\n/).map(function (line) {
      return line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }).join('<br>');
  }

  // 'reply-all' when the open message has anyone on Cc. Otherwise a reply to the sender.
  function replyFormKind(cc) {
    return addressList(cc).length ? 'reply-all' : 'reply';
  }

  function defaultAsyncCall(fn) {
    return new Promise(function (resolve) {
      try {
        fn(function (result) {
          var ok = result && typeof Office !== 'undefined' && result.status === Office.AsyncResultStatus.Succeeded;
          resolve({ ok: Boolean(ok), value: ok ? result.value : null });
        });
      } catch (err) { resolve({ ok: false, value: null }); }
    });
  }

  // opts.asyncCall matches the pane: fn(cb) -> Promise<{ok, value}>.
  // opts.compose is the pane's compose check. opts.me is the mailbox address.
  function read(item, opts) {
    var o = opts || {};
    if (!item) return Promise.resolve(fail('no-item'));
    var call = typeof o.asyncCall === 'function' ? o.asyncCall : defaultAsyncCall;
    var coercion = o.coercionText || (typeof Office !== 'undefined' && Office.CoercionType ? Office.CoercionType.Text : 'text');
    var compose = typeof o.compose === 'boolean' ? o.compose : Boolean(item.subject && typeof item.subject.getAsync === 'function');
    var me = String(o.me || '').trim().toLowerCase();

    function bodyText() {
      if (!item.body || typeof item.body.getAsync !== 'function') return Promise.resolve(fail('body-unreadable'));
      return call(function (cb) { item.body.getAsync(coercion, cb); }).then(function (r) {
        if (!r || !r.ok || typeof r.value !== 'string') return fail('body-unreadable');
        return { ok: true, text: r.value };
      });
    }

    function subjectOf() {
      if (item.subject && typeof item.subject.getAsync === 'function') {
        return call(function (cb) { item.subject.getAsync(cb); }).then(function (r) {
          return r && r.ok ? String(r.value || '') : '';
        });
      }
      return Promise.resolve(typeof item.subject === 'string' ? item.subject : '');
    }

    function recips(field) {
      var value = item[field];
      if (value && typeof value.getAsync === 'function') {
        return call(function (cb) { value.getAsync(cb); }).then(function (r) {
          return r && r.ok ? addressList(r.value) : [];
        });
      }
      return Promise.resolve(addressList(value));
    }

    function fromOf() {
      if (compose) return Promise.resolve({ email: '', name: null });
      var from = item.from || null;
      if (from && typeof from.getAsync === 'function') {
        return call(function (cb) { from.getAsync(cb); }).then(function (r) {
          var details = r && r.ok ? r.value : null;
          return { email: emailOf(details), name: nameOf(details) };
        });
      }
      return Promise.resolve({ email: emailOf(from), name: nameOf(from) });
    }

    return bodyText().then(function (body) {
      if (!body.ok) return body;
      return Promise.all([subjectOf(), recips('to'), recips('cc'), fromOf()]).then(function (parts) {
        var subject = parts[0];
        var readTo = parts[1];
        var readCc = parts[2];
        var from = parts[3];
        var text = plainBody(body.text);
        var fromEmail = from.email;
        var fromName = from.name;
        var to = readTo;
        var cc = readCc;
        if (compose) {
          var quoted = quotedIncoming(body.text);
          if (!quoted) return fail('no-quoted-message');
          text = quoted.text;
          fromEmail = quoted.from || '';
          fromName = quoted.fromName || null;
          to = me ? [me] : [];
          cc = [];
        }
        if (!String(text || '').trim()) return fail('empty-item');
        return {
          ok: true,
          message: {
            text: text,
            subject: subject,
            from: fromEmail,
            fromName: fromName,
            to: to,
            cc: cc,
            conversationId: typeof item.conversationId === 'string' ? item.conversationId : '',
            isMine: Boolean(me && fromEmail && fromEmail === me)
          },
          recipients: { to: readTo, cc: readCc }
        };
      });
    });
  }

  var api = {
    read: read,
    addressList: addressList,
    emailOf: emailOf,
    nameOf: nameOf,
    quotedIncoming: quotedIncoming,
    htmlToText: htmlToText,
    canonId: canonId,
    draftHtml: draftHtml,
    replyFormKind: replyFormKind
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GlanceOutlookItem = api;
})(typeof window !== 'undefined' ? window : globalThis);
