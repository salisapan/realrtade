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

  // The quoted original inside a reply body, or null when this body is only the person's own typing.
  function quotedIncoming(text) {
    var t = String(text || '').replace(/\r\n/g, '\n');
    var marks = [];
    var on = /(?:^|\n)On [\s\S]{0,180}?wrote:\s*/i.exec(t);
    if (on) marks.push({ index: on.index, end: on.index + on[0].length, kind: 'on', raw: on[0] });
    var from = /(?:^|\n)(?:From|מאת):\s*([^\n<]{0,120}?)(?:\s*<([^>\n]+@[^>\n]+)>)?\s*(?:\n|$)/i.exec(t);
    if (from) marks.push({ index: from.index, end: from.index + from[0].length, kind: 'from', name: from[1], email: from[2] });
    var orig = /(?:^|\n)-{3,}\s*Original Message\s*-{3,}\s*/i.exec(t);
    if (orig) marks.push({ index: orig.index, end: orig.index + orig[0].length, kind: 'orig' });
    if (!marks.length) return null;
    marks.sort(function (a, b) { return a.index - b.index; });
    var hit = marks[0];
    var body = t.slice(hit.end).trim();
    if (!body) return null;
    var fromName = null;
    var fromEmail = '';
    if (hit.kind === 'from') {
      fromName = String(hit.name || '').trim() || null;
      fromEmail = String(hit.email || '').trim().toLowerCase();
    } else if (hit.kind === 'on') {
      fromName = trailingName(hit.raw.replace(/wrote:\s*$/i, '').split(/\s+/).filter(Boolean));
    }
    return { text: body, fromName: fromName, from: fromEmail };
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
        var text = body.text;
        var fromEmail = from.email;
        var fromName = from.name;
        var to = readTo;
        var cc = readCc;
        if (compose) {
          var quoted = quotedIncoming(text);
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
    draftHtml: draftHtml,
    replyFormKind: replyFormKind
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GlanceOutlookItem = api;
})(typeof window !== 'undefined' ? window : globalThis);
