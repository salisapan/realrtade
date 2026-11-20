/* global module */
// Reads the WHOLE conversation of the open message, or says why it could not.
// There is no latest-message-only fallback: any gap (no id, no token, a failed page, a page cap hit,
// the open message missing from the result) returns { ok: false, why } and the pane shows no card.
//
// Microsoft Graph, read only, delegated Mail.Read (already declared by the extension, flow-trial-extension/core/outlook-config.js).
// Every call is a GET. Nothing here can write, send, or delete.
(function (root) {
  'use strict';

  var GRAPH = 'https://graph.microsoft.com/v1.0';
  var PAGE_SIZE = 50;
  var MAX_PAGES = 10;

  function fail(why) { return { ok: false, why: why }; }

  // EWS ids use + and /, Graph ids use - and _. Same bytes, different alphabet.
  function canonId(id) {
    return String(id || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function oq(value) { return String(value).replace(/'/g, "''"); }

  function getJson(f, token, url) {
    return f(url, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', Prefer: 'outlook.body-content-type="text"' }
    }).then(function (res) {
      if (!res || !res.ok) return fail('http-' + (res && res.status ? res.status : 'error'));
      return res.json().then(function (json) {
        return json && typeof json === 'object' ? { ok: true, json: json } : fail('bad-shape');
      }, function () { return fail('bad-shape'); });
    }, function () { return fail('network'); });
  }

  // opts: { itemRestId, conversationId, me, getToken, fetch, pageSize, maxPages }
  // itemRestId: the open message as a Graph id (read mode). conversationId: the Office.js id (compose mode).
  function read(opts) {
    var o = opts || {};
    var f = o.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!f) return Promise.resolve(fail('no-fetch'));
    if (typeof o.getToken !== 'function') return Promise.resolve(fail('no-token'));
    if (!o.itemRestId && !o.conversationId) return Promise.resolve(fail('no-conversation'));
    var me = String(o.me || '').toLowerCase();
    var maxPages = o.maxPages || MAX_PAGES;
    var size = o.pageSize || PAGE_SIZE;
    var token;

    function gotToken(t) {
      token = t;
      if (!token) return fail('no-token');
      if (!o.itemRestId) return { ok: true, conv: canonId(o.conversationId) };
      return getJson(f, token, GRAPH + '/me/messages/' + encodeURIComponent(o.itemRestId) + '?$select=id,conversationId').then(function (r) {
        if (!r.ok) return r;
        var conv = r.json.conversationId;
        return conv ? { ok: true, conv: canonId(conv) } : fail('no-conversation');
      });
    }

    function pages(conv) {
      var all = [];
      var url = GRAPH + '/me/messages?$filter=' + encodeURIComponent("conversationId eq '" + oq(conv) + "'") +
        '&$select=id,conversationId,subject,from,receivedDateTime,sentDateTime,isDraft,body&$top=' + size;
      function next(n) {
        if (n > maxPages) return Promise.resolve(fail('incomplete'));
        return getJson(f, token, url).then(function (r) {
          if (!r.ok) return r;
          if (!Array.isArray(r.json.value)) return fail('bad-shape');
          all = all.concat(r.json.value);
          if (r.json['@odata.nextLink']) {
            url = String(r.json['@odata.nextLink']);
            if (url.indexOf(GRAPH + '/') !== 0) return fail('bad-shape');
            return next(n + 1);
          }
          return { ok: true, raw: all, conv: conv };
        });
      }
      return next(1);
    }

    function shape(r) {
      if (!r.ok) return r;
      var messages = [];
      for (var i = 0; i < r.raw.length; i++) {
        var m = r.raw[i];
        if (!m || !m.id) return fail('bad-shape');
        // A message from another conversation in the result means the filter did not do what we asked: not a thread we can trust.
        if (canonId(m.conversationId) !== r.conv) return fail('wrong-conversation');
        if (m.isDraft) continue;
        var email = m.from && m.from.emailAddress ? String(m.from.emailAddress.address || '').toLowerCase() : '';
        var text = m.body && typeof m.body.content === 'string' ? m.body.content : null;
        if (text === null) return fail('unreadable-message');
        var ts = Date.parse(m.receivedDateTime || m.sentDateTime || '');
        messages.push({
          id: m.id,
          from: email,
          fromName: m.from && m.from.emailAddress ? (m.from.emailAddress.name || null) : null,
          ts: isNaN(ts) ? null : ts,
          subject: String(m.subject || ''),
          text: text,
          isMine: Boolean(me) && email === me
        });
      }
      if (!messages.length) return fail('empty');
      if (messages.some(function (m) { return m.ts === null; })) return fail('unreadable-message');
      messages.sort(function (a, b) { return a.ts - b.ts; });
      if (o.itemRestId && !messages.some(function (m) { return m.id === o.itemRestId; })) return fail('item-missing');
      return { ok: true, messages: messages, conversationId: r.conv };
    }

    return new Promise(function (res) { res(o.getToken()); }).then(gotToken, function () { return fail('no-token'); })
      .then(function (r) { return r.ok ? pages(r.conv) : r; })
      .then(shape)
      .catch(function () { return fail('network'); });
  }

  var api = { read: read, canonId: canonId, GRAPH: GRAPH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GlanceOutlookThread = api;
})(typeof window !== 'undefined' ? window : globalThis);
