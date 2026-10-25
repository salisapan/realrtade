/* global Office, GlanceOutlookEngine */

(function () {
  'use strict';

  var UNDO_KEY = 'glanceOutlookUndo';

  function el(tag, text) {
    var node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function readItem() {
    return new Promise(function (resolve, reject) {
      var item = Office.context.mailbox.item;
      if (!item || !item.body) return reject(new Error('no-item'));
      item.body.getAsync(Office.CoercionType.Text, function (result) {
        if (result.status !== Office.AsyncResultStatus.Succeeded) return reject(new Error('body-read'));
        var from = item.from && item.from.emailAddress ? item.from.emailAddress : null;
        resolve({
          text: String(result.value || ''),
          subject: item.subject || '',
          sender: { email: from, name: item.from && item.from.displayName ? item.from.displayName : null }
        });
      });
    });
  }

  function judgeMail(ctx) {
    return GlanceOutlookEngine.judge({
      text: ctx.text,
      subject: ctx.subject,
      sender: ctx.sender,
      to: [],
      ownAddresses: [],
      now: new Date(),
      surface: 'outlook',
      attachmentCount: 0
    });
  }

  function renderQuiet(root) {
    root.replaceChildren(el('p', 'Nothing to close.'));
  }

  function renderProposal(root, judged, ctx) {
    root.replaceChildren();
    var draft = GlanceOutlookEngine.draftText(judged.process, {
      sender: ctx.sender,
      subject: ctx.subject
    });
    if (!draft) {
      renderQuiet(root);
      return;
    }
    root.appendChild(el('p', draft.slice(0, 280)));
    var btn = el('button', 'Do it');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      doDraft(draft, root);
    });
    root.appendChild(btn);
  }

  function doDraft(draftText, root) {
    var item = Office.context.mailbox.item;
    if (!item) return;
    if (item.displayReplyForm) {
      item.displayReplyForm({ htmlBody: draftText.replace(/\n/g, '<br>') });
      verifyDraft(draftText, root);
      return;
    }
    if (item.body && item.body.setAsync) {
      item.body.setAsync(draftText, { coercionType: Office.CoercionType.Text }, function (result) {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          root.replaceChildren(el('p', "Couldn't confirm"));
          return;
        }
        verifyDraft(draftText, root);
      });
    }
  }

  function verifyDraft(expected, root) {
    var item = Office.context.mailbox.item;
    if (!item || !item.body) return;
    item.body.getAsync(Office.CoercionType.Text, function (result) {
      var read = result.status === Office.AsyncResultStatus.Succeeded ? String(result.value || '') : '';
      var ok = normalize(read) === normalize(expected);
      if (!ok) {
        root.replaceChildren(el('p', "Couldn't confirm"));
        return;
      }
      try {
        sessionStorage.setItem(UNDO_KEY, JSON.stringify({ prior: '', body: expected }));
      } catch (err) { /* session only */ }
      root.replaceChildren();
      root.appendChild(el('p', 'Draft ready in Outlook.'));
      var undo = el('button', 'Undo');
      undo.type = 'button';
      undo.addEventListener('click', function () {
        undoDraft(root);
      });
      root.appendChild(undo);
    });
  }

  function undoDraft(root) {
    var raw = sessionStorage.getItem(UNDO_KEY);
    if (!raw) return;
    var saved = JSON.parse(raw);
    var item = Office.context.mailbox.item;
    if (!item || !item.body) return;
    item.body.setAsync(saved.prior || '', { coercionType: Office.CoercionType.Text }, function () {
      sessionStorage.removeItem(UNDO_KEY);
      root.replaceChildren(el('p', 'Undone.'));
    });
  }

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function boot() {
    var root = document.getElementById('glance-card');
    readItem()
      .then(function (ctx) {
        var judged = judgeMail(ctx);
        if (!judged || !judged.show || !judged.process) {
          renderQuiet(root);
          return;
        }
        if (!GlanceOutlookEngine.draftText(judged.process, { sender: ctx.sender, subject: ctx.subject })) {
          renderQuiet(root);
          return;
        }
        renderProposal(root, judged, ctx);
      })
      .catch(function () {
        renderQuiet(root);
      });
  }

  Office.onReady(function () {
    boot();
  });
})();
