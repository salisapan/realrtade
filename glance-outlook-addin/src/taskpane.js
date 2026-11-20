/* global Office, GlanceOutlookEngine, GlanceOutlookThread */
// Glance task pane for Outlook.
//
// Rules this file keeps (behavior.test.cjs holds each one):
//  - When GlanceOutlookAuth.getToken exists, it reads the WHOLE conversation or shows no card. No latest-message fallback.
//  - When that sign-in is not in the bundle, it reads the open item with Office.js (body, subject, from, to, cc,
//    conversationId) and judges that message. It does not call Graph.
//  - It never writes until the person clicks "Insert draft". Opening the pane writes nothing.
//  - It never sends. No send call exists in this file, in item.js, or in thread.js, and the manifest declares no send surface.
//  - A compose write is read back from the open reply, shows its proof, and Undo runs only if the person has not edited it.
//  - A read-mode Insert opens a reply form (displayReplyForm, or displayReplyAllForm when the message has Cc). Undo does not
//    change the open message. Closing that reply discards the draft.
//  - A reply draft is a draft, not a close. The compose proof says "inserted and read back". It never says "handled".
// Microsoft scopes: none declared here. The whole-thread read asks GlanceOutlookAuth.getToken() for a Mail.Read token.
// That object is not in this bundle. The open message does not need it.
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
    'body-unreadable': 'The open message could not be read.',
    'empty-item': 'The open message has no body.',
    'no-quoted-message': 'This reply does not include the message it answers, so Glance stays out of it.',
    'no-reply-form': 'This message cannot open a reply draft.',
    'reply-form-refused': 'Outlook did not open the reply draft.',
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

  // The open message, kept by conversation id, so a reply whose quoted original cannot be parsed
  // still judges the message Glance already read.
  var readCache = {};
  function rememberItem(message) {
    var key = GlanceOutlookItem.canonId(message && message.conversationId);
    if (!key) return;
    readCache[key] = {
      text: message.text,
      subject: message.subject,
      from: message.from,
      fromName: message.fromName,
      to: message.to,
      cc: message.cc,
      conversationId: message.conversationId,
      isMine: message.isMine
    };
  }
  function recallItem(conversationId) {
    var key = GlanceOutlookItem.canonId(conversationId);
    return key && readCache[key] ? readCache[key] : null;
  }

  // The open item only. Used when GlanceOutlookAuth is not in the bundle. No Graph.
  function loadOpenItem(item, compose) {
    var mailbox = Office.context.mailbox;
    var me = mailbox.userProfile && mailbox.userProfile.emailAddress ? mailbox.userProfile.emailAddress : '';
    var name = mailbox.userProfile && mailbox.userProfile.displayName ? mailbox.userProfile.displayName : '';
    return GlanceOutlookItem.read(item, {
      me: me,
      compose: compose,
      asyncCall: asyncCall,
      coercionText: Office.CoercionType.Text
    }).then(function (res) {
      if (!res.ok && compose && res.why === 'no-quoted-message') {
        var cached = recallItem(item.conversationId);
        if (cached) res = { ok: true, message: cached };
      }
      if (!res.ok) return { res: res, me: me, name: name };
      if (!compose) rememberItem(res.message);
      var messages = [res.message];
      messages.source = 'office-item';
      return { res: { ok: true, messages: messages, source: 'office-item' }, me: me, name: name };
    });
  }

  // draftText with no draft step still returns "Following up on your message below. [Write your reply here]".
  // That string names no ask. A real draft quotes the message. A task-only close (a self-sent ask) uses the task title.
  function genericDraft(text) {
    return /Following up on your message below|בהמשך להודעה שלך למטה/.test(text || '')
      && /\[Write your reply here\]|\[כתוב כאן את התשובה\]/.test(text || '');
  }

  function draftForCard(judged, message, sender) {
    var steps = (judged.process && judged.process.steps) || [];
    var draftStep = null;
    var taskStep = null;
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      if (!step) continue;
      if (step.kind === 'outlookDraft' || step.kind === 'gmailDraft') draftStep = step;
      if (step.kind === 'outlookTask' || step.kind === 'googleTask') taskStep = step;
    }
    var process = judged.process;
    if (draftStep && message && message.text) {
      var params = Object.assign({}, draftStep.params || {});
      if (!params.askText) params.askText = message.text;
      if (!params.what) params.what = message.text;
      var cloned = steps.map(function (step) {
        return step === draftStep ? Object.assign({}, step, { params: params }) : step;
      });
      process = Object.assign({}, judged.process, { steps: cloned });
    }
    var drafted = GlanceOutlookEngine.draftText(process, { sender: sender, subject: message.subject });
    if (drafted && !genericDraft(drafted)) return drafted;
    var ask = message && message.text ? message.text : '';
    if (ask) {
      var synthetic = { steps: [{ kind: 'outlookDraft', id: 'draft', params: { what: ask, askText: ask } }] };
      var built = GlanceOutlookEngine.draftText(synthetic, { sender: sender, subject: message.subject });
      if (built && !genericDraft(built)) return built;
    }
    var title = taskStep && taskStep.params && (taskStep.params.title || taskStep.params.what);
    if (title) return String(title);
    var label = judged.intent && (judged.intent.label || (judged.intent.entities && judged.intent.entities.what));
    return label || ask || '';
  }

  function judgeThread(messages, me, name) {
    var last = messages[messages.length - 1];
    var office = messages.source === 'office-item';
    // A whole thread whose newest message is the person's own stays quiet. The open item is different:
    // a self-sent ask is still an ask, the same rule the shared judge uses for Gmail.
    if (!office && last.isMine) return { show: false, reason: 'last-message-is-mine' };
    var sender = { email: last.from || null, name: last.fromName };
    var to = office ? (Array.isArray(last.to) ? last.to : []) : (me ? [me] : []);
    var cc = office ? (Array.isArray(last.cc) ? last.cc : []) : [];
    var selfSent = office && last.from && me && String(last.from).toLowerCase() === String(me).toLowerCase();
    var judgedInput = {
      text: last.text,
      subject: last.subject,
      sender: sender,
      to: to,
      ownAddresses: me ? [me] : [],
      userName: name || null,
      ownNames: name ? [name] : null,
      namesWaitDone: true,
      now: now(),
      surface: 'outlook',
      attachmentCount: 0
    };
    if (office) judgedInput.cc = cc;
    if (selfSent) {
      judgedInput.senderIsUser = true;
      judgedInput.inSent = true;
      judgedInput.inbound = false;
    }
    var judged = GlanceOutlookEngine.judge(judgedInput);
    if (!judged || !judged.show || !judged.process) return { show: false, reason: (judged && judged.reason) || 'intent-null' };
    var draft = office
      ? draftForCard(judged, last, sender)
      : GlanceOutlookEngine.draftText(judged.process, { sender: sender, subject: last.subject });
    if (!draft || genericDraft(draft)) return { show: false, reason: 'no-draft-step' };
    return {
      show: true,
      draft: draft,
      sender: sender,
      count: messages.length,
      source: office ? 'office-item' : 'thread',
      to: to,
      cc: cc,
      subject: last.subject || '',
      conversationId: last.conversationId || ''
    };
  }

  function renderCard(root, verdict, compose) {
    root.replaceChildren();
    root.setAttribute('data-glance-state', 'card');
    root.removeAttribute('data-glance-why');
    if (verdict.source === 'office-item') {
      root.setAttribute('data-glance-source', 'office-item');
      root.setAttribute('data-glance-conversation', verdict.conversationId || '');
      root.setAttribute('data-glance-from', (verdict.sender && verdict.sender.email) || '');
      root.setAttribute('data-glance-to', (verdict.to || []).join(','));
      root.setAttribute('data-glance-cc', (verdict.cc || []).join(','));
      root.setAttribute('data-glance-subject', verdict.subject || '');
      root.appendChild(el('p', 'Read this message.'));
    } else {
      root.setAttribute('data-glance-source', 'thread');
      root.appendChild(el('p', 'Read ' + verdict.count + ' message' + (verdict.count === 1 ? '' : 's') + ' in this thread.'));
    }
    root.appendChild(el('p', verdict.draft.slice(0, 280)));
    if (!compose) {
      if (verdict.source === 'office-item') {
        var open = el('button', 'Insert draft');
        open.type = 'button';
        open.setAttribute('data-glance-action', 'insert');
        open.addEventListener('click', function () { openReplyForm(root, verdict); });
        root.appendChild(open);
        return;
      }
      root.appendChild(el('p', 'To use it, open a reply, then open Glance there and click Insert draft.'));
      return;
    }
    var btn = el('button', 'Insert draft');
    btn.type = 'button';
    btn.setAttribute('data-glance-action', 'insert');
    btn.addEventListener('click', function () { insertDraft(root, verdict.draft); });
    root.appendChild(btn);
  }

  // Read mode. Opens a reply form with the draft and does not send. Cc on the open message uses reply-all.
  function openReplyForm(root, verdict) {
    var item = Office.context.mailbox && Office.context.mailbox.item;
    if (!item || typeof GlanceOutlookItem === 'undefined') return failWrite(root, 'no-reply-form');
    var kind = GlanceOutlookItem.replyFormKind(verdict.cc);
    var fn = kind === 'reply-all' && typeof item.displayReplyAllForm === 'function' ? 'displayReplyAllForm' : 'displayReplyForm';
    if (typeof item[fn] !== 'function') return failWrite(root, 'no-reply-form');
    var html = GlanceOutlookItem.draftHtml(verdict.draft);
    try {
      item[fn]({ htmlBody: html });
    } catch (err) {
      return failWrite(root, 'reply-form-refused');
    }
    root.replaceChildren();
    root.setAttribute('data-glance-state', 'reply-opened');
    root.setAttribute('data-glance-reply-form', fn);
    root.appendChild(el('p', 'Reply draft opened. Not sent.'));
    var undo = el('button', 'Undo');
    undo.type = 'button';
    undo.setAttribute('data-glance-action', 'undo');
    undo.addEventListener('click', function () { discardReplyForm(root); });
    root.appendChild(undo);
  }

  // The reply form is a separate window. Office.js does not hand it back, so Undo leaves the open message as it was.
  // Closing that reply discards the draft. Nothing is sent.
  function discardReplyForm(root) {
    root.replaceChildren();
    root.setAttribute('data-glance-state', 'discarded');
    root.appendChild(el('p', 'Nothing was sent. Close the reply to discard the draft.'));
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

  var shownGeneration = 0;
  function showCurrentItem() {
    var token = ++shownGeneration;
    var root = document.getElementById('glance-card');
    var item = Office.context.mailbox && Office.context.mailbox.item;
    if (!item) return Promise.resolve(renderQuiet(root, 'no-item'));
    var compose = isCompose(item);
    var auth = typeof GlanceOutlookAuth !== 'undefined' ? GlanceOutlookAuth : null;
    var authed = Boolean(auth && typeof auth.getToken === 'function');
    var pending = authed ? loadThread(item, compose) : loadOpenItem(item, compose);
    return pending.then(function (t) {
      if (token !== shownGeneration) return;
      if (!t.res.ok) return renderQuiet(root, t.res.why);
      var verdict = judgeThread(t.res.messages, t.me, t.name);
      if (!verdict.show) return renderQuiet(root, verdict.reason);
      renderCard(root, verdict, compose);
    }).catch(function () {
      if (token !== shownGeneration) return;
      renderQuiet(root, 'network');
    });
  }

  function watchItemChanges() {
    var mailbox = Office.context && Office.context.mailbox;
    if (!mailbox || typeof mailbox.addHandlerAsync !== 'function') return;
    if (!Office.EventType || !Office.EventType.ItemChanged) return;
    try {
      mailbox.addHandlerAsync(Office.EventType.ItemChanged, function () { showCurrentItem(); });
    } catch (err) { /* the pane still reads the item it opened on */ }
  }

  function boot() {
    watchItemChanges();
    return showCurrentItem();
  }

  var ready = new Promise(function (resolve) {
    Office.onReady(function () { resolve(boot()); });
  });
  var api = { ready: ready, whyText: whyText };
  if (typeof window !== 'undefined') window.GlanceOutlookPane = api;
  else globalThis.GlanceOutlookPane = api;
})();
