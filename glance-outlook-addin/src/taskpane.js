/* global Office, GlanceOutlookEngine, GlanceOutlookThread */
// Glance task pane for Outlook.
//
// Rules this file keeps (behavior.test.cjs holds each one):
//  - It reads the WHOLE conversation or shows no card. No latest-message-only fallback. Every gap is a quiet card with a why.
//  - It never writes until the person clicks "Insert draft" in a reply they are composing. Opening the pane writes nothing.
//  - It never sends. No send call exists in this file or in thread.js, and the manifest declares no send surface.
//  - Every write is read back from the open message, shows its proof, and has an Undo that only runs if the person has not
//    edited the text since.
//  - A reply draft is a draft, not a close. The proof says "inserted and read back". It never says "handled".
// Microsoft scopes: none declared here. The thread read asks GlanceOutlookAuth.getToken() for a Mail.Read token. Without one
// (the shipped state until a sign-in is wired) the pane shows no card and says so.
(function () {
  'use strict';

  var WHY = {
    'no-token': 'Glance cannot read the whole thread yet (not signed in to Outlook mail).',
    'no-fetch': 'Glance cannot read the whole thread in this client.',
    'no-conversation': 'This message has no conversation to read, so there is no thread to judge.',
    'incomplete': 'The thread is too long to read in full, so Glance stays out of it.',
    'empty': 'The thread came back empty.',
    'item-missing': 'The open message was not in the thread that came back.',
    'wrong-conversation': 'The thread read returned messages from another conversation.',
    'unreadable-message': 'A message in the thread could not be read.',
    'bad-shape': 'The thread read returned something Glance does not understand.',
    'network': 'The thread read failed.',
    'no-item': 'There is no open message.',
    'last-message-is-mine': 'Your message is the last one in the thread. Nothing is waiting on you.',
    'no-draft-step': 'This asks for something other than a reply draft, which Glance does not write here.',
    'quiet:marketing': 'This looks like a bulk or marketing message.',
    'too-short': 'This message is too short to hold a request.',
    'intent-null': 'No request addressed to you in this thread.',
    'quiet:family': 'This looks personal, so Glance stays quiet.',
    'quiet:hedge': 'The ask is not clear enough to act on.'
  };

  function whyText(code) {
    if (WHY[code]) return WHY[code];
    var m = /^http-(\w+)$/.exec(code || '');
    if (m) return 'The thread read was refused (' + m[1] + ').';
    if (/^quiet:/.test(code || '')) return 'Nothing in this thread needs you (' + code.slice(6) + ').';
    return 'Nothing in this thread needs you (' + (code || 'no reason given') + ').';
  }

  function el(tag, text) {
    var node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function asyncCall(fn) {
    return new Promise(function (resolve) {
      try {
        fn(function (result) {
          var ok = result && result.status === Office.AsyncResultStatus.Succeeded;
          resolve({ ok: Boolean(ok), value: ok ? result.value : null });
        });
      } catch (err) { resolve({ ok: false, value: null }); }
    });
  }

  function isCompose(item) {
    return Boolean(item && item.subject && typeof item.subject.getAsync === 'function');
  }

  function now() {
    return new Date();
  }

  function renderQuiet(root, why) {
    root.replaceChildren();
    root.setAttribute('data-glance-state', 'quiet');
    root.setAttribute('data-glance-why', why);
    root.appendChild(el('p', 'Nothing to close.'));
    root.appendChild(el('p', 'Why: ' + whyText(why)));
  }

  function proofLine(proof) {
    return 'Read back from this message at ' + proof.verifiedAt + '. Not sent.';
  }

  function getBody(item, type) {
    return asyncCall(function (cb) { item.body.getAsync(type, cb); });
  }

  // The thread, or a why. Compose reads by the conversation id of the reply being written; read mode reads by the open
  // message's REST id and checks that message is in what came back.
  function loadThread(item, compose) {
    var mailbox = Office.context.mailbox;
    var me = mailbox.userProfile && mailbox.userProfile.emailAddress ? mailbox.userProfile.emailAddress : '';
    var auth = typeof GlanceOutlookAuth !== 'undefined' ? GlanceOutlookAuth : null;
    var opts = {
      me: me,
      getToken: auth && typeof auth.getToken === 'function' ? function () { return auth.getToken(); } : null
    };
    if (compose) {
      opts.conversationId = item.conversationId || '';
    } else if (item.itemId && typeof mailbox.convertToRestId === 'function') {
      opts.itemRestId = mailbox.convertToRestId(item.itemId, Office.MailboxEnums.RestVersion.v2_0);
    } else {
      opts.conversationId = item.conversationId || '';
    }
    var name = mailbox.userProfile && mailbox.userProfile.displayName ? mailbox.userProfile.displayName : '';
    return GlanceOutlookThread.read(opts).then(function (res) { return { res: res, me: me, name: name }; });
  }

  function judgeThread(messages, me, name) {
    var last = messages[messages.length - 1];
    if (last.isMine) return { show: false, reason: 'last-message-is-mine' };
    var sender = { email: last.from || null, name: last.fromName };
    var judged = GlanceOutlookEngine.judge({
      text: last.text,
      subject: last.subject,
      sender: sender,
      to: me ? [me] : [],
      ownAddresses: me ? [me] : [],
      userName: name || null,
      ownNames: name ? [name] : null,
      namesWaitDone: true,
      now: now(),
      surface: 'outlook',
      attachmentCount: 0
    });
    if (!judged || !judged.show || !judged.process) return { show: false, reason: (judged && judged.reason) || 'intent-null' };
    var draft = GlanceOutlookEngine.draftText(judged.process, { sender: sender, subject: last.subject });
    if (!draft) return { show: false, reason: 'no-draft-step' };
    return { show: true, draft: draft, sender: sender, count: messages.length };
  }

  function renderCard(root, verdict, compose) {
    root.replaceChildren();
    root.setAttribute('data-glance-state', 'card');
    root.removeAttribute('data-glance-why');
    root.appendChild(el('p', 'Read ' + verdict.count + ' message' + (verdict.count === 1 ? '' : 's') + ' in this thread.'));
    root.appendChild(el('p', verdict.draft.slice(0, 280)));
    if (!compose) {
      root.appendChild(el('p', 'To use it, open a reply, then open Glance there and click Insert draft.'));
      return;
    }
    var btn = el('button', 'Insert draft');
    btn.type = 'button';
    btn.setAttribute('data-glance-action', 'insert');
    btn.addEventListener('click', function () { insertDraft(root, verdict.draft); });
    root.appendChild(btn);
  }

  function failWrite(root, why, extra) {
    root.replaceChildren();
    root.setAttribute('data-glance-state', 'write-failed');
    root.setAttribute('data-glance-why', why);
    root.appendChild(el('p', "Couldn't confirm the draft."));
    root.appendChild(el('p', extra || 'Why: ' + why));
  }

  // The only write. Runs on a click. Adds the draft above whatever the reply already holds, reads the body back, and keeps
  // what Undo needs. Nothing is sent.
  function insertDraft(root, draft) {
    var item = Office.context.mailbox.item;
    if (!isCompose(item)) return failWrite(root, 'not-compose');
    var priorHtml, priorText;
    return getBody(item, Office.CoercionType.Html).then(function (h) {
      if (!h.ok) return failWrite(root, 'prior-unreadable');
      priorHtml = String(h.value || '');
      return getBody(item, Office.CoercionType.Text).then(function (t) {
        if (!t.ok) return failWrite(root, 'prior-unreadable');
        priorText = String(t.value || '');
        var html = draft.split('\n').map(function (l) {
          return l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }).join('<br>') + '<br><br>';
        return asyncCall(function (cb) { item.body.prependAsync(html, { coercionType: Office.CoercionType.Html }, cb); })
          .then(function (w) {
            if (!w.ok) return failWrite(root, 'write-refused');
            return getBody(item, Office.CoercionType.Text).then(function (back) {
              var read = back.ok ? normalize(back.value) : '';
              var want = normalize(draft);
              var kept = !normalize(priorText) || read.indexOf(normalize(priorText)) >= 0;
              if (read.indexOf(want) !== 0 || !kept) {
                // Put the reply back as it was, then say what happened. Never leave a half-written reply claiming success.
                return asyncCall(function (cb) { item.body.setAsync(priorHtml, { coercionType: Office.CoercionType.Html }, cb); })
                  .then(function (r) {
                    return failWrite(root, 'read-back-mismatch', r.ok
                      ? 'Why: the message did not read back as written. The reply was put back as it was.'
                      : 'Why: the message did not read back as written, and putting it back could not be confirmed. Check the reply.');
                  });
              }
              var proof = { system: 'outlook/compose-body', fetchedBack: true, verifiedAt: now().toISOString() };
              renderWritten(root, { proof: proof, priorHtml: priorHtml, priorText: priorText, written: read });
            });
          });
      });
    });
  }

  function renderWritten(root, state) {
    root.replaceChildren();
    root.setAttribute('data-glance-state', 'written');
    root.appendChild(el('p', 'Draft inserted in your reply.'));
    root.appendChild(el('p', proofLine(state.proof)));
    var undo = el('button', 'Undo');
    undo.type = 'button';
    undo.setAttribute('data-glance-action', 'undo');
    undo.addEventListener('click', function () { undoDraft(root, state); });
    root.appendChild(undo);
  }

  // Undo only if the text is still exactly what Glance read back. If the person edited it, their edit wins.
  function undoDraft(root, state) {
    var item = Office.context.mailbox.item;
    if (!isCompose(item)) return failWrite(root, 'not-compose');
    return getBody(item, Office.CoercionType.Text).then(function (now1) {
      if (!now1.ok || normalize(now1.value) !== state.written) {
        root.replaceChildren();
        root.setAttribute('data-glance-state', 'undo-skipped');
        root.appendChild(el('p', 'You changed the reply after Glance wrote to it, so Undo left it as it is.'));
        return;
      }
      return asyncCall(function (cb) { item.body.setAsync(state.priorHtml, { coercionType: Office.CoercionType.Html }, cb); })
        .then(function (w) {
          if (!w.ok) return failWrite(root, 'undo-refused');
          return getBody(item, Office.CoercionType.Text).then(function (back) {
            var ok = back.ok && normalize(back.value) === normalize(state.priorText);
            root.replaceChildren();
            if (!ok) {
              root.setAttribute('data-glance-state', 'undo-unconfirmed');
              root.appendChild(el('p', "Couldn't confirm Undo. Check the reply."));
              return;
            }
            root.setAttribute('data-glance-state', 'undone');
            root.appendChild(el('p', 'Undone. The reply is back as it was.'));
          });
        });
    });
  }

  function boot() {
    var root = document.getElementById('glance-card');
    var item = Office.context.mailbox && Office.context.mailbox.item;
    if (!item) return Promise.resolve(renderQuiet(root, 'no-item'));
    var compose = isCompose(item);
    return loadThread(item, compose).then(function (t) {
      if (!t.res.ok) return renderQuiet(root, t.res.why);
      var verdict = judgeThread(t.res.messages, t.me, t.name);
      if (!verdict.show) return renderQuiet(root, verdict.reason);
      renderCard(root, verdict, compose);
    }).catch(function () {
      renderQuiet(root, 'network');
    });
  }

  var ready = new Promise(function (resolve) {
    Office.onReady(function () { resolve(boot()); });
  });
  var api = { ready: ready, whyText: whyText };
  if (typeof window !== 'undefined') window.GlanceOutlookPane = api;
  else globalThis.GlanceOutlookPane = api;
})();
