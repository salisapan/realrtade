// The popup is the only configuration surface, and it is deliberately one
// question long: sign in, or don't. There is no rule builder here and there
// never will be — that is the product boundary. It used to also ask "what
// kind of work do you do" to steer domain-specific vocabulary; that's gone
// from onboarding (see wireSave()'s comment) — one fewer decision between
// installing and Glance actually doing something.

(async function popupInit() {
  let status = await send({ type: 'flow:connector-status' });
  let state = await FlowStorage.get();
  // Declared here, not next to renderMemoryInsight/wireMemoryInsight further
  // down, because it has to be. `let` bindings are live from the top of
  // their function's scope but stay in the temporal dead zone until their
  // own statement runs — and renderMemoryInsight (called from inside
  // renderLog, called on the very next line below) reads this variable
  // before execution would ever reach its old declaration site further down
  // this same function body. That's not a hypothetical: it threw
  // "Cannot access 'currentInsight' before initialization" on every single
  // popup open, which aborted renderLog() partway through — silently
  // breaking the Activity tab's memory-insight card, referral prompt, and
  // the log list itself, every time, since nothing after the throwing
  // await in this function ever ran.
  let currentInsight = null;

  // Same relocation, same reason, one variable over: STEP_NOUNS is a
  // `const`, but a `const` is exactly as dead-zoned as a `let` until its own
  // statement runs — it does not matter that this one is never reassigned.
  // renderMemoryInsight (called from renderLog, called two lines below)
  // only reaches STEP_NOUNS after its own `if (!currentInsight) return`
  // guard, which is why this stayed hidden even after the currentInsight
  // fix above: it only throws once there is an actual insight to show, not
  // on every popup open — silently breaking the Activity tab (and, later,
  // the "Learned" stat right above it) the first time Execution Memory
  // finally had something to say, rather than the first time anyone opened
  // the popup.
  const STEP_NOUNS = { calendar: 'the Calendar step', draft: 'the draft reply step', task: 'the Task step' };

  // Declared up here for the same temporal-dead-zone reason as the two above:
  // wirePro() runs a few lines below, long before this function's body would
  // reach the Glance Pro section where these are used.
  const OFFER_URL = 'https://theflow-ai.com/.netlify/functions/create-checkout';
  let proOffer = { enabled: false, trialDays: 0 };
  // Same trap again: renderWaiting() runs before a later `let` would initialise.
  let loopView = 'date';

  try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.captureNow) renderCapture().catch(() => {}); }); } catch (e) { /* optional */ }
  wireTabs();
  wireSave();
  wireRecipe();
  wirePro();
  wireLoopView();
  renderConnectors();
  renderStatusPill();
  await renderLog();
  await renderOpen();
  await renderWaiting();
  checkOutsideSignals().catch(() => {});
  syncTaskCompletions().catch(() => {});
  renderQuestion().catch(() => {});
  renderIdentityLinks().catch(() => {});
  renderCapture().catch(() => {});
  renderSurfaces().catch(() => {});
  renderOutlookCards().catch(() => {});
  outlookAutoSync().catch(() => {});


  // ---- Glance Pro -----------------------------------------------------------
  // Free stays free: this card never blocks anything. It shows one of four
  // things — nothing but a "have a key?" link while checkout is closed, the
  // offer once it is open, the live subscription, or a lapsed key.
  function proNote(text, isError) {
    const n = document.getElementById('proNote');
    n.textContent = text || '';
    n.hidden = !text;
    n.classList.toggle('err', Boolean(isError));
  }

  async function fetchProOffer() {
    try {
      const res = await fetch(OFFER_URL);
      const data = await res.json();
      return data && data.enabled ? { enabled: true, trialDays: data.trialDays || 0 } : { enabled: false, trialDays: 0 };
    } catch (e) {
      return { enabled: false, trialDays: 0 };
    }
  }

  async function renderPro() {
    const status = await send({ type: 'flow:pro-status' });
    const record = status && status.record;
    const info = FlowEntitlements.describe(record, Date.now());
    const closes = (state.closeStats && state.closeStats.total) || 0;
    const stored = await chrome.storage.local.get('proNudgeDismissedAt');
    const nudge = FlowEntitlements.shouldNudge({ checkoutOpen: proOffer.enabled, pro: info.state === 'pro' || info.state === 'trial', closes, dismissedAt: stored.proNudgeDismissedAt }, Date.now());

    const show = (id, on) => { document.getElementById(id).hidden = !on; };
    const active = info.state === 'pro' || info.state === 'trial';
    const badge = document.getElementById('proBadge');
    badge.hidden = !active;
    badge.textContent = active ? info.label + ' · ' + info.detail : '';

    show('proPitch', !active && proOffer.enabled);
    const start = document.getElementById('proStart');
    start.textContent = proOffer.trialDays > 0 ? 'Start ' + proOffer.trialDays + '-day free trial' : 'Get Glance Pro';
    show('proStart', !active && proOffer.enabled);
    show('proManage', active && record && record.status !== 'comp');
    show('proHaveKey', !active);
    show('proRemove', Boolean(record && record.key));
    if (info.state === 'lapsed') proNote('Your Pro subscription has ended. Renew it, or remove the key.', true);

    const block = document.getElementById('proBlock');
    block.classList.toggle('nudge', nudge);
    show('proNudgeX', nudge);
    if (nudge && block.parentNode.firstElementChild !== block) block.parentNode.insertBefore(block, block.parentNode.firstElementChild);
  }

  function wirePro() {
    const keyRow = document.getElementById('proKeyRow');
    const input = document.getElementById('proKeyInput');
    document.getElementById('proHaveKey').addEventListener('click', () => {
      keyRow.hidden = !keyRow.hidden;
      if (!keyRow.hidden) input.focus();
    });
    async function activate() {
      const btn = document.getElementById('proActivate');
      btn.disabled = true; btn.textContent = 'Checking…';
      const res = await send({ type: 'flow:pro-activate', key: input.value });
      btn.disabled = false; btn.textContent = 'Activate';
      if (res && res.ok) {
        input.value = ''; keyRow.hidden = true;
        proNote('Glance Pro is active on this device.', false);
        send({ type: 'flow:track', event: 'pro_activated', params: {} });
      } else {
        proNote((res && res.error) || 'Could not activate that key.', true);
      }
      await renderPro();
    }
    document.getElementById('proActivate').addEventListener('click', activate);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') activate(); });
    document.getElementById('proStart').addEventListener('click', () => {
      send({ type: 'flow:track', event: 'pro_start_clicked', params: {} });
      chrome.tabs.create({ url: FlowEntitlements.PRICING_URL });
    });
    document.getElementById('proManage').addEventListener('click', async () => {
      const res = await send({ type: 'flow:pro-billing' });
      if (res && res.ok && res.url) chrome.tabs.create({ url: res.url });
      else proNote((res && res.error) || 'Could not open billing right now.', true);
    });
    document.getElementById('proRemove').addEventListener('click', async () => {
      await send({ type: 'flow:pro-deactivate' });
      proNote('Key removed from this device.', false);
      await renderPro();
    });
    document.getElementById('proNudgeX').addEventListener('click', async () => {
      await chrome.storage.local.set({ proNudgeDismissedAt: Date.now() });
      await renderPro();
    });
    fetchProOffer().then((offer) => { proOffer = offer; return renderPro(); });
    renderPro();
  }

  function send(msg) {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // A .primary button's visible text lives in its .btn-label span, not the
  // button's own textContent — the shell/ring/shine spans are siblings of
  // that text, and `btn.textContent = ...` would silently delete all three
  // of them along with whatever was there before. Falls back to plain
  // textContent for a .ghost button, which has no such spans.
  function setBtnLabel(btn, text) {
    const label = btn.querySelector('.btn-label');
    if (label) label.textContent = text; else btn.textContent = text;
  }

  async function refresh() {
    status = await send({ type: 'flow:connector-status' });
    state = await FlowStorage.get();
    renderConnectors();
    renderStatusPill();
    renderSetupDone();
  }

  // Once a system is connected there is nothing left to save, so the button
  // gives way to a plain "you're set" line. Disconnecting brings it back.
  function renderSetupDone() {
    const saveBtn = document.getElementById('save');
    const note = document.getElementById('saved-note');
    if (!saveBtn || !note) return;
    const connected = Object.keys(status || {}).some((k) => status[k].connected);
    const done = connected && !!(state && state.onboarded);
    saveBtn.style.display = done ? 'none' : '';
    if (done) {
      note.textContent = 'You\u2019re set. Open an email in Gmail \u2014 Glance stays quiet until one matters.';
      note.hidden = false;
    }
  }

  function renderStatusPill() {
    const pill = document.getElementById('statusPill');
    const live = Object.keys(status || {}).filter((k) => status[k].connected);
    if (!live.length) { pill.textContent = 'Not connected'; pill.className = 'ver'; return; }
    const conn = FLOW_CONNECTORS.find((c) => c.id === live[0]);
    pill.textContent = (conn ? conn.label : live[0]) + ' connected';
    pill.className = 'ver on';
  }

  /* ---------------------------------------------------------- connectors */

  function renderConnectors() {
    const host = document.getElementById('connector-list');
    host.replaceChildren();
    // MVP surface is one connector, one decision: sign in, or don't. The rest
    // of FLOW_CONNECTORS still work (background.js's WRITERS/UNDOERS keep
    // them wired) but showing four more cards here is exactly the setup
    // friction the MVP is supposed to have zero of.
    FLOW_CONNECTORS.filter((c) => c.mvp).forEach((c) => host.appendChild(connectorCard(c)));
  }

  function connectorCard(c) {
    const st = (status && status[c.id]) || {};
    const card = el('div', 'conn' + (c.status === 'planned' ? ' planned' : '') + (st.connected ? ' on' : ''));

    const head = el('div', 'conn-head');
    const name = el('div', 'conn-name');
    name.appendChild(el('b', null, c.label));
    name.appendChild(el('i', null, c.kind));
    head.appendChild(name);

    if (c.status === 'planned') head.appendChild(el('span', 'badge', 'Planned'));
    else if (st.connected) head.appendChild(el('span', 'badge on', 'Connected'));
    else if (c.status === 'live' || st.configured === true) head.appendChild(el('span', 'badge live', 'Works now'));
    else head.appendChild(el('span', 'badge', 'Needs setup'));
    card.appendChild(head);

    if (c.note) card.appendChild(el('p', 'conn-note', c.note));
    if (st.connected && st.detail) card.appendChild(el('p', 'conn-detail', 'Writing to: ' + st.detail));

    if (c.status === 'planned') return card;

    const err = el('p', 'conn-err');
    err.hidden = true;

    if (st.connected) {
      const off = el('button', 'ghost', 'Disconnect');
      off.type = 'button';
      off.addEventListener('click', async () => {
        await send({ type: 'flow:disconnect', connectorId: c.id });
        if (state.connectorId === c.id) await FlowStorage.set({ connectorId: null, onboarded: false });
        await refresh();
      });
      card.appendChild(off);
      card.appendChild(err);
      return card;
    }

    // Connectors that need a value only the user knows (a token, or which
    // channel/board to write to) carry their own tiny form regardless of
    // whether connecting itself is a pasted token or an OAuth redirect.
    const inputs = {};
    if (c.fields && c.fields.length) {
      const form = el('div', 'conn-form');
      (c.fields || []).forEach((f) => {
        const input = el('input');
        input.type = f.type === 'password' ? 'password' : 'text';
        input.placeholder = f.placeholder || f.label;
        input.setAttribute('aria-label', c.label + ' ' + f.label);
        input.spellcheck = false;
        inputs[f.key] = input;
        form.appendChild(input);
      });
      if (c.setupUrl) {
        const help = el('a', 'conn-help', 'Create a token →');
        help.href = c.setupUrl; help.target = '_blank'; help.rel = 'noopener';
        form.appendChild(help);
      }
      card.appendChild(form);
    }

    const ready = st.configured !== false;
    // Only the ready (primary/.doit-style) button gets the shell/ring/shine
    // spans — .ghost.wide (missing OAuth config, MVP-inert) stays a plain
    // outlined pill, same distinction the marketing site draws between its
    // .doit button and everything else.
    const btn = el('button', ready ? 'primary sm' : 'ghost wide');
    if (ready) {
      btn.appendChild(el('span', 'shell'));
      btn.appendChild(el('span', 'ring'));
      btn.appendChild(el('span', 'shine'));
      btn.appendChild(el('span', 'btn-label', 'Connect ' + c.label));
    } else {
      btn.textContent = 'Connect ' + c.label;
    }
    btn.type = 'button';
    btn.addEventListener('click', async () => {
      btn.disabled = true; setBtnLabel(btn, 'Connecting…'); err.hidden = true;
      const msg = { type: 'flow:connect', connectorId: c.id };
      Object.keys(inputs).forEach((k) => { msg[k] = inputs[k].value; });
      const res = await send(msg);
      if (res && res.ok) {
        // Connecting IS the setup. Making people also press "Save & start"
        // afterwards was a second click that did nothing the first did not.
        await FlowStorage.set({ connectorId: c.id, onboarded: true });
        chrome.runtime.sendMessage({ type: 'flow:track', event: 'connector_configured', params: { connector: c.id } });
        await refresh();
      } else {
        btn.disabled = false; setBtnLabel(btn, 'Connect ' + c.label);
        err.textContent = (res && res.error) || 'Connection failed.';
        err.hidden = false;
      }
    });
    card.appendChild(btn);
    card.appendChild(err);
    return card;
  }

  /* ---------------------------------------------------------------- save */

  function wireSave() {
    document.getElementById('save').addEventListener('click', async () => {
      const connected = Object.keys(status || {}).filter((k) => status[k].connected);
      const note = document.getElementById('saved-note');
      if (!connected.length) {
        note.textContent = 'Connect a system above first — Glance has nowhere to write yet.';
        note.hidden = false;
        return;
      }
      await FlowStorage.set({
        onboarded: true,
        // domainId deliberately left unset: judgment.js's evaluate() falls
        // back to FLOW_DOMAINS[0] whenever it's missing or unmatched, and
        // that fallback already produces a good generic label (neutralTitle)
        // for any text that isn't literally sales vocabulary — so there's
        // nothing this question was buying a doctor, a lawyer, or a guide
        // that the universal commit/obligation/date/money signals don't
        // already cover on their own.
        connectorId: connected.includes(state.connectorId) ? state.connectorId : connected[0]
      });
      state = await FlowStorage.get();
      note.textContent = 'Saved. Open an email in Gmail — Glance will stay quiet until one matters.';
      note.hidden = false;
    });
  }

  /* --------------------------------------------------------------- recipe */
  // A recipe is a shareable "how someone else set Glance up" — never a
  // token, a log entry, or anything Glance wrote, so passing a .glance file
  // around is as safe as describing your setup in a Slack message.
  //
  // Domain (FLOW_DOMAINS) used to be a live onboarding question here too —
  // it isn't anymore (see wireSave()'s own comment: domainId is now
  // deliberately left unset, and judgment.js falls back to FLOW_DOMAINS[0]
  // whenever it's missing). A recipe exported today therefore carries only
  // connectorId, the one thing Setup still actually asks. Import still
  // honors a domainId from an OLDER recipe if one is present — that field
  // isn't meaningless, just no longer collected — but never requires it:
  // gating the whole import on a field the current product doesn't even
  // offer a way to set was rejecting every recipe this product can produce
  // today as "not a valid Glance recipe."

  function noteRecipe(text, ok) {
    const note = document.getElementById('recipeNote');
    note.textContent = text;
    note.style.color = ok ? 'var(--ok)' : 'var(--err)';
    note.hidden = false;
  }

  // Pulled out of wireRecipe()'s click handler so the referral card below
  // can trigger the exact same export — same file shape, same download,
  // same confirmation copy — instead of a second export path that could
  // quietly drift from this one.
  function exportRecipe() {
    const domain = state.domainId ? FLOW_DOMAINS.find((d) => d.id === state.domainId) : null;
    const connector = FLOW_CONNECTORS.find((c) => c.id === state.connectorId);
    const recipe = { flowRecipe: 1, connectorId: connector ? connector.id : null, connectorLabel: connector ? connector.label : null };
    // Only included when this account actually has one set — see this
    // section's header comment for why fabricating a default here (every
    // export used to claim domainId:'sales' whether or not that was ever
    // chosen) was its own small state-truthfulness bug.
    if (domain) { recipe.domainId = domain.id; recipe.domainLabel = domain.label; }
    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'glance-recipe' + (connector ? '-' + connector.id : '') + (domain ? '-' + domain.id : '') + '.glance';
    a.click();
    URL.revokeObjectURL(url);
  }

  function wireRecipe() {
    document.getElementById('recipeExport').addEventListener('click', () => {
      exportRecipe();
      noteRecipe('Recipe exported. Anyone can drop this file into their own Glance to match your setup.', true);
    });

    document.getElementById('recipeImport').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch (err) {
        noteRecipe('That file isn’t a valid Glance recipe.', false);
        return;
      }
      // Only ever read two known string fields off the parsed JSON — never
      // trust or store anything else a file could contain. Accept the file
      // if EITHER is present and recognized; today's own export only ever
      // sets connectorId (see this section's header comment), so requiring
      // domainId too rejected every recipe this product can currently
      // produce.
      const wantedConnector = FLOW_CONNECTORS.find((c) => c.id === parsed.connectorId);
      const validDomain = FLOW_DOMAINS.find((d) => d.id === parsed.domainId);
      if (!wantedConnector && !validDomain) {
        noteRecipe('That file isn’t a valid Glance recipe.', false);
        return;
      }
      if (validDomain) await FlowStorage.set({ domainId: validDomain.id });
      state = await FlowStorage.get();
      // There is no domain picker left in this UI to re-render (see this
      // section's header comment) — a call here used to reference a
      // renderDomains() that had already been deleted along with that
      // picker, throwing before either noteRecipe() below ever ran. Every
      // import silently did nothing visible, whether or not the storage
      // write itself (above) actually succeeded.
      const what = validDomain && wantedConnector ? validDomain.label + ' + ' + wantedConnector.label
        : validDomain ? validDomain.label
        : wantedConnector.label;
      // mvp is the same bar renderConnectors() uses to decide which cards
      // this Setup screen actually shows — pointing at "Connect X above"
      // for one of the four dormant connectors would be the exact dead-end
      // this pass's own connector-error fix (background.js) exists to
      // avoid, just reached from a different door.
      const alreadyConnected = wantedConnector && status && status[wantedConnector.id] && status[wantedConnector.id].connected;
      if (wantedConnector && wantedConnector.mvp && !alreadyConnected) {
        noteRecipe('Loaded — ' + what + '. Connect ' + wantedConnector.label + ' above to match it exactly, or use whatever you already have.', true);
      } else {
        noteRecipe('Loaded — ' + what + '. Click Save & start to apply it.', true);
      }
    });
  }

  /* ----------------------------------------------------------------- log */

  function wireTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', async () => {
        document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
        document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab.dataset.tab));
        if (tab.dataset.tab === 'log') await renderLog();
        if (tab.dataset.tab === 'open') await renderOpen();
      });
    });
  }

  /* ---------------------------------------------------------------- open */
  // Still Open, the same list the morning brief shows. Not every unresolved
  // chip — core/still-open.js already capped and ranked this. Do It is
  // handed to a Gmail tab so the write stays on content-gmail.js's existing
  // path (tasks, calendar, draft). There is no second writer here.

  function pendingRowSubtitle(entry) {
    const who = (entry.sender && entry.sender.name) || (entry.sender && entry.sender.email) || '';
    const what = entry.subject || (entry.intent && entry.intent.label) || '';
    return who && what ? who + ' — ' + what : (what || who);
  }

  async function closeStillOpenFromPopup(entry) {
    // Outlook incoming ask: Do It creates a reply draft in Outlook Drafts (never sends), plus a Google Task when connected.
    if (entry && (entry.app === 'outlook' || (entry.process && entry.process.steps && entry.process.steps.some((s) => s.kind === 'outlookDraft')))) {
      const o = outlook();
      if (!o) return;
      const incomingId = entry.outlookIncomingId || entry.messageId;
      const label = (entry.intent && entry.intent.label) || (entry.process && entry.process.name) || 'Reply';
      const who = (entry.sender && entry.sender.name) || '';
      const email = (entry.sender && entry.sender.email) || '';
      const bodyText = entry.text || '';
      const replyText = (typeof FlowOutlookReply !== 'undefined' && FlowOutlookReply.buildBody)
        ? FlowOutlookReply.buildBody({
            intent: entry.intent || {},
            text: bodyText,
            subject: entry.subject || '',
            senderName: who,
            senderEmail: email
          })
        : ('Hi,\n\nThanks for your note. I will follow up shortly.\n');
      // Delivered-to alias when known (identity primary), else account primary.
      const st0 = await o.status();
      const fromAddress = st0.primary || null;
      const draft = await o.createReplyDraft(incomingId, replyText, { fromAddress: fromAddress });
      if (draft && draft.fallback) {
        const due = entry.intent && entry.intent.facts && entry.intent.facts.date && entry.intent.facts.date.iso;
        await send({ type: 'flow:follow-task', payload: { title: label, dueIso: due || null, what: label, counterpart: who, threadUrl: entry.threadUrl } });
        await FlowStorage.appendLog({ kind: 'written', label: label + ' - task ready; open in Outlook to reply (draft permission not granted).', messageId: entry.messageId, app: 'outlook' });
        await renderOpen();
        await renderOutlookCards();
        return;
      }
      if (!draft || !draft.ok) {
        await FlowStorage.appendLog({ kind: 'written', label: 'Could not create Outlook draft' + (draft && draft.error ? ' (' + draft.error + ')' : ''), messageId: entry.messageId, app: 'outlook' });
        await renderOpen();
        return;
      }
      await FlowStorage.appendLog({
        kind: 'written',
        label: draft.written,
        messageId: entry.messageId,
        app: 'outlook',
        connectorId: 'outlookDraft',
        ref: draft.ref,
        where: draft.where,
        url: draft.where,
        sender: entry.sender || null,
        subject: entry.subject || null,
        intent: entry.intent || null,
        process: entry.process || null,
        text: bodyText,
        outlookIncomingId: incomingId,
        outlookReceipt: true
      });
      if (entry.messageId) {
        await FlowStorage.recordStillOpenMetric({ kind: 'doIt', messageId: entry.messageId });
        await FlowStorage.recordCloseQuality({ kind: 'doIt', messageId: entry.messageId });
      }
      // Drop duplicate From Outlook card; Still Open will show the receipt instead.
      if (typeof o.dismissIncoming === 'function') {
        await o.dismissIncoming(entry.key || entry.messageId);
      }
      if (typeof depsForget === 'function') { /* noop */ }
      if (typeof FlowStorage.forgetStillOpenScan === 'function' && entry.messageId) {
        try { await FlowStorage.forgetStillOpenScan(entry.messageId); } catch (e) {}
      }
      const due = entry.intent && entry.intent.facts && entry.intent.facts.date && entry.intent.facts.date.iso;
      try {
        const task = await send({ type: 'flow:follow-task', payload: { title: label, dueIso: due || null, what: label, counterpart: who, threadUrl: entry.threadUrl } });
        if (task && task.ok && task.ref) {
          await FlowStorage.appendLog({ kind: 'written', label: 'Task due ' + (due || 'soon'), messageId: entry.messageId, connectorId: 'googleTask', ref: task.ref, app: 'outlook' });
        }
      } catch (e) { /* Google may not be connected; draft still stands */ }
      await renderOpen();
      await renderOutlookCards();
      return;
    }
    let tabs = [];
    if (chrome.tabs && chrome.tabs.query) {
      try { tabs = await chrome.tabs.query({ url: 'https://mail.google.com/*' }); }
      catch (e) { tabs = []; }
    }
    const tab = tabs && tabs[0];
    if (tab && tab.id != null && chrome.tabs.sendMessage) {
      const delivered = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: 'flow:still-open-do-it', messageId: entry.messageId }, () => {
          resolve(!chrome.runtime.lastError);
        });
      });
      if (delivered) return;
    }
    await chrome.storage.local.set({ glanceStillOpenPendingDoIt: entry.messageId });
    if (chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: entry.threadUrl || 'https://mail.google.com/mail/u/0/#inbox' });
    }
  }

  function openRow(entry) {
    const item = el('div', 'log-item');
    const top = el('div', 'log-top');
    const why = (typeof FlowStillOpen !== 'undefined' && FlowStillOpen.whyLine(entry)) || entry.process.name;
    top.appendChild(el('span', 'log-label', why));
    // 'app' only exists on entries logged after this was added — every
    // entry from before falls back to 'gmail', the only source that has
    // ever existed, rather than showing a blank tag.
    top.appendChild(el('span', 'log-kind', (entry.app || 'gmail').toUpperCase()));
    item.appendChild(top);
    if (entry.app === 'outlook') item.appendChild(el('span', 'log-where', 'From Outlook'));

    const subtitle = pendingRowSubtitle(entry);
    if (subtitle) item.appendChild(el('span', 'log-where', subtitle));
    // "Make unresolved processes harder to forget" — an item open for three
    // weeks used to look identical to one from ten minutes ago in this
    // list. Same when()/.when the Activity tab's own logRow() already uses,
    // reused rather than a second age-formatting rule, on entry.ts —
    // appendLog stamps every row with ts unconditionally, 'shown' included.
    if (entry.ts && typeof FlowStillOpen !== 'undefined' && FlowStillOpen.agingOf) {
      const ag = FlowStillOpen.agingOf(entry, Date.now());
      if (ag.label) item.appendChild(el('span', 'log-age ' + ag.level, ag.label));
    }
    if (entry.ts) item.appendChild(el('span', 'when', when(entry.ts)));

    const acts = el('div', 'log-acts');
    const doIt = el('button', 'primary sm');
    doIt.type = 'button';
    doIt.appendChild(el('span', 'shell'));
    doIt.appendChild(el('span', 'ring'));
    doIt.appendChild(el('span', 'shine'));
    doIt.appendChild(el('span', 'btn-label', 'Do It'));
    doIt.addEventListener('click', async () => {
      doIt.disabled = true;
      const label = doIt.querySelector('.btn-label');
      if (label) label.textContent = 'Closing…';
      await closeStillOpenFromPopup(entry);
    });
    acts.appendChild(doIt);
    if (entry.threadUrl || entry.url) {
      const view = el('a', 'ghost sm', (entry.outlookReceipt || entry.connectorId === 'outlookDraft') ? 'Open draft' : 'View');
      view.href = entry.url || entry.threadUrl; view.target = '_blank'; view.rel = 'noopener';
      acts.appendChild(view);
    }
    const dismiss = el('button', 'ghost sm', 'Dismiss');
    dismiss.type = 'button';
    dismiss.addEventListener('click', async () => {
      dismiss.disabled = true; dismiss.textContent = 'Dismissing…';
      // The exact same storage/module calls content-gmail.js's own
      // onDismiss makes, verbatim — no DOM, no background.js round trip.
      await FlowStorage.appendLog({
        kind: 'dismissed',
        label: (entry.intent && entry.intent.label) || entry.process.name,
        messageId: entry.messageId,
        score: entry.signals && entry.signals.score
      });
      await FlowStorage.calibrate('dismiss');
      // Same reject as the in-Gmail chip dismiss. Once per message.
      if (entry.messageId) {
        await FlowStorage.recordCloseQuality({ kind: 'falseDoIt', messageId: entry.messageId, reason: 'dismiss' });
        await FlowStorage.recordStillOpenMetric({ kind: 'falseClose', messageId: entry.messageId, reason: 'dismiss' });
      }
      if (typeof FlowExecutionMemory !== 'undefined' && entry.process && entry.process.steps) {
        await FlowExecutionMemory.recordDismiss(entry.process.id, entry.process.steps.map((s) => s.id), entry.messageId);
      }
      chrome.runtime.sendMessage({ type: 'flow:track', event: 'chip_dismissed', params: { domain: state.domainId } });
      chrome.runtime.sendMessage({ type: 'flow:track', event: 'process_closed', params: { domain: state.domainId, method: 'dismissed' } });
      await renderOpen();
    });
    acts.appendChild(dismiss);
    item.appendChild(acts);
    return item;
  }


  // ---- Open loops: what others owe you ---------------------------------------
  // A loop is something you asked for and have not had back. Free follows three
  // at a time and drafts the friendly nudge; Pro follows all of them, shows the
  // money still owed to you, and drafts the firmer second and last third nudge.
  // Nothing here reads mail: every record was made by the person clicking
  // "Stay on it", and every change to it came from them or from a reply they
  // opened in Gmail.
  function dayShort(iso) {
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function whoLabel(w) {
    return FlowFollowUp.firstName(w.counterpart && w.counterpart.name, w.counterpart && w.counterpart.email) || (w.subject || 'Reply');
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // ---- Loops settled outside the thread (core/outside-signals.js) -------------------------
  // A calendar entry that now exists closes a "pick a time" loop; a file named for what you promised and shared
  // with that person asks once. Metadata only; at most a few lookups per popup open. (Money arriving is handled
  // in Gmail, where the confirmation email is opened.) A function with a property, not a let: renderWaiting()
  // runs before any later `let` would initialise.
  async function checkOutsideSignals() {
    if (typeof FlowOutsideSignals === 'undefined' || typeof FlowStorage === 'undefined') return;
    const now = Date.now();
    const seen = checkOutsideSignals.seen || (checkOutsideSignals.seen = {});
    const all = await FlowStorage.getWatches();
    const todo = all.filter(FlowFollowUp.isActive).filter((w) => (FlowOutsideSignals.wantsCalendar(w) || FlowOutsideSignals.wantsDrive(w)) && !(seen[w.id] && now - seen[w.id] < 10 * 60 * 1000)).slice(0, 6);
    if (!todo.length) return;
    const asks = [];
    let changed = false;
    for (const w of todo) {
      seen[w.id] = now;
      if (FlowOutsideSignals.wantsCalendar(w)) {
        const r = await send({ type: 'flow:outside-calendar', email: w.counterpart.email, sinceMs: w.createdAt });
        const m = r && r.ok ? FlowOutsideSignals.matchCalendar(w, r.events, now) : null;
        if (m) {
          const prop = FlowOutsideSignals.proposal(w, m, now);
          await FlowStorage.updateWatch(w.id, prop.patch);
          if (w.taskRef) await send({ type: 'flow:follow-complete', ref: w.taskRef });
          if (FlowStorage.recordOutcomeLabel) FlowStorage.recordOutcomeLabel('autoClosed', w.id + '|' + now).catch(() => {});
          changed = true;
        }
      } else if (FlowOutsideSignals.wantsDrive(w)) {
        const ent = (FlowRequestTypes.OBJECTS || []).find((o) => o.id === String(w.subtype).split(':')[1]);
        const terms = ent ? ent.en.filter((x) => /^[a-z]+$/.test(x)).concat(ent.he.filter((x) => x.length >= 2)) : [];
        const r = await send({ type: 'flow:outside-drive', sinceMs: w.createdAt, terms });
        const m = r && r.ok ? FlowOutsideSignals.matchDrive(w, r.files) : null;
        if (m) asks.push({ w, m, prop: FlowOutsideSignals.proposal(w, m, now) });
      }
    }
    if (changed) await renderWaiting();
    renderSignalAsks(asks);
  }

  function renderSignalAsks(asks) {
    const block = document.getElementById('signalBlock');
    const host = document.getElementById('signal-list');
    host.replaceChildren();
    block.hidden = asks.length === 0;
    for (const a of asks) {
      const item = el('div', 'wait-item');
      const top = el('div', 'wait-top');
      top.appendChild(el('span', 'wait-who', whoLabel(a.w)));
      top.appendChild(el('span', 'wait-state', a.prop.question));
      item.appendChild(top);
      item.appendChild(el('div', 'wait-what', a.w.what));
      const acts = el('div', 'wait-acts');
      const yes = el('button', 'ghost sm', a.prop.yes);
      yes.type = 'button';
      yes.addEventListener('click', async () => {
        await FlowStorage.updateWatch(a.w.id, a.prop.patch);
        if (a.w.taskRef) await send({ type: 'flow:follow-complete', ref: a.w.taskRef });
        await renderWaiting();
        item.remove();
        block.hidden = !host.children.length;
      });
      const no = el('button', 'ghost sm', a.prop.no);
      no.type = 'button';
      no.addEventListener('click', async () => {
        await FlowStorage.updateWatch(a.w.id, FlowOutsideSignals.dismissPatch(a.w, a.m.kind));
        item.remove();
        block.hidden = !host.children.length;
      });
      acts.appendChild(yes); acts.appendChild(no);
      item.appendChild(acts);
      host.appendChild(item);
    }
  }

  // Voice-matched drafts (core/style-profile.js): Pro only. A template draft opens and closes the way this person does.
  // Nothing else in the draft changes, and with no profile (or not Pro) the text is returned exactly as written.
  async function voiced(text, w) {
    try {
      if (!text || typeof FlowStyle === 'undefined' || !FlowStorage.getStyleProfile) return text;
      const status = await send({ type: 'flow:pro-status' });
      if (!FlowEntitlements.isActive(status && status.record, Date.now())) return text;
      const sum = FlowStyle.summary(await FlowStorage.getStyleProfile(), w && w.lang === 'he' ? 'he' : 'en');
      return FlowStyle.restyle(text, sum, { name: FlowFollowUp.firstName(w.counterpart && w.counterpart.name, w.counterpart && w.counterpart.email) });
    } catch (e) { return text; }
  }

  // ---- Stay on this (a selection from any page, core/capture.js) -----------------------------------------------
  // The right-click handler stored the sentence and the page; here the person says who it is with and whose move it is.
  async function renderCapture() {
    const block = document.getElementById('captureBlock');
    if (!block || typeof FlowCapture === 'undefined') return;
    const st = await chrome.storage.local.get({ captureNow: null });
    const p = st.captureNow ? FlowCapture.pending({ text: st.captureNow.text, pageUrl: st.captureNow.pageUrl }, st.captureNow.at) : null;
    const host = document.getElementById('capture-card');
    host.replaceChildren();
    if (!p || !FlowCapture.fresh(p, Date.now())) { block.hidden = true; if (st.captureNow) await chrome.storage.local.remove('captureNow'); return; }
    block.hidden = false;
    const item = el('div', 'wait-item');
    const top = el('div', 'wait-top');
    top.appendChild(el('span', 'wait-who', p.host || 'A page'));
    top.appendChild(el('span', 'wait-state', 'Stay on this?'));
    item.appendChild(top);
    item.appendChild(el('div', 'wait-what', '\u201c' + p.text + '\u201d'));
    const who = el('input', null);
    who.type = 'text'; who.placeholder = 'Who is it with? (optional)'; who.maxLength = 60; who.setAttribute('aria-label', 'Who is it with');
    item.appendChild(who);
    const mine = { v: false };
    const pick = el('div', 'wait-acts');
    const bWait = el('button', 'ghost sm', 'They owe me');
    const bOwe = el('button', 'ghost sm', 'I owe it');
    bWait.type = 'button'; bOwe.type = 'button';
    const mark = () => { bWait.setAttribute('aria-pressed', String(!mine.v)); bOwe.setAttribute('aria-pressed', String(mine.v)); };
    bWait.addEventListener('click', () => { mine.v = false; mark(); });
    bOwe.addEventListener('click', () => { mine.v = true; mark(); });
    mark();
    pick.appendChild(bWait); pick.appendChild(bOwe);
    item.appendChild(pick);
    const note = el('p', 'wait-note');
    note.hidden = true;
    const acts = el('div', 'wait-acts');
    const go = el('button', 'ghost sm', 'Stay on it');
    go.type = 'button';
    go.addEventListener('click', async () => {
      go.disabled = true;
      const loop = FlowCapture.toLoop(p, { who: who.value, mine: mine.v }, Date.now());
      const list = await FlowStorage.getWatches();
      const status = await send({ type: 'flow:pro-status' });
      const gate = FlowEntitlements.watchGate(list.filter(FlowFollowUp.isActive).length, status && status.record, Date.now());
      if (!loop) { go.disabled = false; return; }
      if (!gate.allowed) { go.disabled = false; note.hidden = false; note.textContent = 'You are following ' + gate.used + ' of ' + gate.cap + ' open loops. Close one first, or see Glance Pro.'; return; }
      const watch = FlowFollowUp.buildWatch(Object.assign({ ask: loop.ask, now: loop.now }, loop.base));
      watch.threadUrl = loop.base.threadUrl;
      if (!list.some((w) => w.id === watch.id && FlowFollowUp.isActive(w))) {
        const made = await send({ type: 'flow:follow-task', payload: { title: FlowFollowUp.taskTitle(watch), dueIso: watch.chaseIso, what: watch.what, counterpart: watch.counterpart.name || null, threadUrl: watch.threadUrl } });
        if (made && made.ok && made.ref) watch.taskRef = made.ref;
        await FlowStorage.upsertWatch(watch);
      }
      await chrome.storage.local.remove('captureNow');
      send({ type: 'flow:track', event: 'follow_captured', params: {} });
      await renderCapture();
      await renderWaiting();
    });
    const cancel = el('button', 'ghost sm', 'Not now');
    cancel.type = 'button';
    cancel.addEventListener('click', async () => { await chrome.storage.local.remove('captureNow'); await renderCapture(); });
    acts.appendChild(go); acts.appendChild(cancel);
    item.appendChild(acts);
    item.appendChild(note);
    host.appendChild(item);
  }

  // ---- Outlook (src/outlook.js) ---------------------------------------------------------------------------------
  // Read-only, last 14 days, only while this panel is open. The runner is built once with the browser's own pieces handed in.
  function outlookDeps() {
    return {
      storage: FlowStorage, cfg: FlowOutlookConfig, auth: FlowOutlookAuth, plan: FlowOutlookSync.plan,
      fetch: (u, i) => fetch(u, i), redirectUri: () => chrome.identity.getRedirectURL(),
      launch: (url) => new Promise((resolve, reject) => { chrome.identity.launchWebAuthFlow({ url, interactive: true }, (r) => { if (chrome.runtime.lastError || !r) reject(new Error('cancelled')); else resolve(r); }); }),
      // Silent renewal: never opens a visible window. Resolves null on chrome.runtime.lastError.
      launchSilent: (url) => new Promise((resolve) => {
        try {
          chrome.identity.launchWebAuthFlow({ url, interactive: false, abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 15000 }, (r) => {
            if (chrome.runtime.lastError || !r) resolve(null); else resolve(r);
          });
        } catch (e) { resolve(null); }
      }),
      permissions: { request: (o) => chrome.permissions.request(o), contains: (o) => chrome.permissions.contains(o), remove: (o) => chrome.permissions.remove(o) },
      send, random: (n) => crypto.getRandomValues(new Uint8Array(n)), sha256: (b) => crypto.subtle.digest('SHA-256', b), now: () => Date.now(),
      planDeps: {
        extract: typeof FlowExtract !== 'undefined' ? FlowExtract : null,
        types: typeof FlowRequestTypes !== 'undefined' ? FlowRequestTypes : null,
        pipeline: typeof FlowIntentPipeline !== 'undefined' ? FlowIntentPipeline : null,
        intent: typeof FlowIntent !== 'undefined' ? FlowIntent : null,
        factReply: typeof FlowFactReply !== 'undefined' ? FlowFactReply : null
      },
      actions: typeof FlowActions !== 'undefined' ? FlowActions : null,
      identity: FlowIdentity, followUp: FlowFollowUp
    };
  }
  function outlook() {
    if (typeof FlowOutlook === 'undefined' || typeof FlowOutlookSync === 'undefined') return null;
    return outlook.inst || (outlook.inst = FlowOutlook.create(outlookDeps()));
  }

  const OUTLOOK_COPY = 'Reads asks made of you and answers to yours, on this device, while this panel is open. On Do It, writes a reply draft into your Outlook Drafts. Never sends. Uses your own Microsoft sign-in; nothing goes to Glance\'s servers.';
  const OUTLOOK_ERRORS = { permission: 'The browser did not grant access, so it stays off.', cancelled: 'The sign-in window was closed.', profile: 'Signed in, but Microsoft did not say whose mailbox this is. Try again.', 'not-configured': 'Not set up yet.' };

  async function renderOutlookRow(host) {
    const o = outlook();
    if (!o) return;
    const st = await o.status();
    const row = el('div', 'wait-item');
    const top = el('div', 'wait-top');
    top.appendChild(el('span', 'wait-who', 'Outlook'));
    const label = !st.configured ? 'Not set up yet' : st.connected ? (st.needsSignIn ? 'Sign in again' : 'On') : 'Off';
    top.appendChild(el('span', 'wait-state' + (st.connected && !st.needsSignIn ? ' ok' : ''), label));
    row.appendChild(top);
    row.appendChild(el('div', 'wait-note', OUTLOOK_COPY));
    if (!st.configured) row.appendChild(el('div', 'wait-note', 'It needs a Microsoft app registration first. Redirect address for it: ' + st.redirectUri));
    if (st.connected) {
      const who = st.primary || (st.account && st.account.address) || '';
      const idN = (typeof st.ownAddressCount === 'number' ? st.ownAddressCount : ((st.ownAddresses && st.ownAddresses.length) || (who ? 1 : 0)));
      const checked = st.lastAt
        ? ('Last checked ' + new Date(st.lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          + ', ' + st.lastCount + ' conversations'
          + (typeof st.lastIncoming === 'number' ? (', ' + st.lastIncoming + ' incoming') : '')
          + '.')
        : 'Not checked yet.';
      row.appendChild(el('div', 'wait-note', (who ? ('Signed in as ' + who + '. ') : '') + idN + ' identities. ' + checked));
      const diags = Array.isArray(st.diagnostics) ? st.diagnostics : [];
      if (diags.length) {
        const details = document.createElement('details');
        details.className = 'wait-note';
        const sum = document.createElement('summary');
        sum.textContent = 'Why not shown (' + diags.length + ')';
        details.appendChild(sum);
        const list = el('div', 'wait-note');
        // Safe local-only readout: subject + reason code, no body text.
        diags.slice(0, 20).forEach((d) => {
          const sub = (d.subject || '(no subject)').slice(0, 80);
          const who2 = d.counterpart ? (' · ' + d.counterpart) : '';
          list.appendChild(el('div', 'wait-note', d.reason + ' — “' + sub + '”' + who2));
        });
        details.appendChild(list);
        row.appendChild(details);
      }
      if (st.fromAliasHint) row.appendChild(el('div', 'wait-note', st.fromAliasHint));
    }
    if (st.error) {
      const sentence = (typeof FlowOutlookAuth !== 'undefined' && FlowOutlookAuth.errorSentence)
        ? FlowOutlookAuth.errorSentence(st.error, st.errorDetail, st.aadsts)
        : (OUTLOOK_ERRORS[st.error] || st.error);
      row.appendChild(el('div', 'wait-note', 'Last check: ' + sentence));
    }
    const note = el('p', 'wait-note');
    note.hidden = true;
    const acts = el('div', 'wait-acts');
    if (st.configured && !st.connected) {
      const c = el('button', 'ghost sm', 'Turn on');
      c.type = 'button';
      c.addEventListener('click', async () => {
        c.disabled = true;
        const r = await o.connect();
        if (!r.ok) {
          c.disabled = false; note.hidden = false;
          const sentence = (typeof FlowOutlookAuth !== 'undefined' && FlowOutlookAuth.errorSentence)
            ? FlowOutlookAuth.errorSentence(r.error, r.description, r.aadsts)
            : (OUTLOOK_ERRORS[r.error] || 'Could not turn it on (' + r.error + ').');
          note.textContent = sentence;
          return;
        }
        await renderSurfaces(); await renderOutlookCards(); await renderWaiting(); if (typeof renderOpen === "function") await renderOpen();
      });
      acts.appendChild(c);
    } else if (st.connected) {
      const chk = el('button', 'ghost sm', st.needsSignIn ? 'Sign in again' : 'Check now');
      chk.type = 'button';
      chk.addEventListener('click', async () => {
        chk.disabled = true;
        const r = st.needsSignIn ? await o.connect() : await o.sync({ force: true });
        if (!r.ok) { chk.disabled = false; note.hidden = false; note.textContent = OUTLOOK_ERRORS[r.error] || ('Could not check (' + r.error + ').'); return; }
        await renderSurfaces(); await renderOutlookCards(); await renderWaiting(); if (typeof renderOpen === "function") await renderOpen();
      });
      const off = el('button', 'ghost sm', 'Turn off');
      off.type = 'button';
      off.addEventListener('click', async () => { off.disabled = true; await o.disconnect(); await renderSurfaces(); await renderOutlookCards(); });
      acts.appendChild(chk); acts.appendChild(off);
    }
    row.appendChild(acts);
    row.appendChild(note);
    host.appendChild(row);
  }


  // ---- a model on this computer (core/local-lm-server.js) ---------------------------------------------------
  // Optional. Ollama or LM Studio, running on THIS computer. Turned on only after it passes the same precision test as the browser's
  // own model, per language, and only ever asked about sentences Glance could not read itself. It only proposes.
  const LOCAL_MODEL_COPY = 'Optional. If you run Ollama or LM Studio on this computer, Glance can ask that model about a sentence it could not read itself. It runs here, costs nothing and needs no key; nothing leaves this computer, and Glance only proposes, you still tap. It is switched on per language only after it passes a precision test on your model.';
  const LM_PROVIDER_LABEL = { ollama: 'Ollama', lmstudio: 'LM Studio' };

  function fmtLm(r) { return r && r.ok ? 'on (precision ' + (r.precision == null ? '?' : r.precision) + ', recall ' + (r.recall == null ? '?' : r.recall) + ')' : r && r.precision != null ? 'off (precision ' + r.precision + ', needs ' + FlowLocalLM.TEST_MIN_PRECISION + ')' : 'off'; }

  // The on-device model and the server fallback (core/hybrid-status.js turns the worker's status into this line). Hidden while the hybrid path is not
  // enabled in this build (config/hybrid.public.js): a row for something that is not there would be a promise with nothing behind it.
  async function renderHybridRow(host) {
    if (typeof FlowHybridStatus === 'undefined') return;
    const raw = await send({ type: 'flow:hybrid-status' });
    const v = FlowHybridStatus.describe(raw);
    if (!v.visible) return;
    const row = el('div', 'wait-item');
    row.id = 'hybridRow';
    const top = el('div', 'wait-top');
    top.appendChild(el('span', 'wait-who', 'On-device processing'));
    top.appendChild(el('span', 'wait-state' + (v.mode === 'local-ready' ? ' ok' : ''), v.label));
    row.appendChild(top);
    if (v.progress !== null) {
      const bar = el('div', 'wait-note', Math.round(v.progress * 100) + '%');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuenow', String(Math.round(v.progress * 100)));
      row.appendChild(bar);
    }
    row.appendChild(el('div', 'wait-note', v.detail));
    const acts = el('div', 'wait-acts');
    const act = (label, msg) => {
      const b = el('button', 'ghost sm', label);
      b.type = 'button';
      b.addEventListener('click', async () => { b.disabled = true; await send(msg); await renderSurfaces(); });
      acts.appendChild(b);
    };
    if (v.canEnable) act('Turn on the on-device model', { type: 'flow:hybrid-consent', patch: { localModel: true } });
    if (v.canRetry) act('Check again', { type: 'flow:hybrid-retry' });
    if (v.canRemove) act('Turn off and free the disk', { type: 'flow:hybrid-consent', patch: { localModel: false } });
    if (acts.children.length) row.appendChild(acts);
    host.appendChild(row);
  }

  // The deeper read (core/ai-ladder.js): the one-time choice, how many are left, and what happens when they run out. Hidden until the server says it is running:
  // a row for something that is not there would be a promise with nothing behind it. Words come from the core, so the corpus can hold them to the identity rules.
  async function renderLadderRow(host) {
    if (typeof FlowAiLadder === 'undefined') return;
    const info = await send({ type: 'flow:ladder-info' });
    if (!info || !info.ok || !info.enabled) return;
    const state = FlowAiLadder.stateOf(info);
    const c = FlowAiLadder.copy(state);
    if (!c) return;
    const row = el('div', 'wait-item');
    row.id = 'ladderRow';
    const top = el('div', 'wait-top');
    top.appendChild(el('span', 'wait-who', 'Second reading'));
    top.appendChild(el('span', 'wait-state' + (state.kind === 'on' || state.kind === 'low' ? ' ok' : ''), state.kind === 'needs-consent' ? 'Off' : state.kind === 'used' ? 'Used up' : state.kind === 'paused' ? 'Resting' : 'On'));
    row.appendChild(top);
    row.appendChild(el('div', 'wait-what', c.title));
    row.appendChild(el('div', 'wait-note', c.detail));
    const acts = el('div', 'wait-acts');
    const act = (label, cls, fn) => {
      const b = el('button', cls, label);
      b.type = 'button';
      b.addEventListener('click', async () => { b.disabled = true; await fn(); await renderSurfaces(); });
      acts.appendChild(b);
    };
    if (state.kind === 'needs-consent') {
      act(c.primary, 'primary sm', () => send({ type: 'flow:ladder-consent', given: true }));
    } else {
      if (c.primary === 'See Pro') act(c.primary, 'primary sm', async () => { chrome.tabs.create({ url: FlowEntitlements.PRICING_URL }); });
      act(c.secondary, 'ghost sm', () => send({ type: 'flow:ladder-consent', given: false }));
    }
    row.appendChild(acts);
    host.appendChild(row);
  }

  async function renderLocalModelRow(host) {
    if (typeof FlowLocalLMServer === 'undefined' || typeof FlowLocalLM === 'undefined' || typeof FlowStorage.getLocalLmServer !== 'function') return;
    const cfg = await FlowStorage.getLocalLmServer();
    const on = cfg.enabled === true && cfg.status && ((cfg.status.en && cfg.status.en.ok) || (cfg.status.he && cfg.status.he.ok));
    const row = el('div', 'wait-item');
    const top = el('div', 'wait-top');
    top.appendChild(el('span', 'wait-who', 'A model on your computer'));
    top.appendChild(el('span', 'wait-state' + (on ? ' ok' : ''), on ? 'On' : 'Off'));
    row.appendChild(top);
    row.appendChild(el('div', 'wait-note', LOCAL_MODEL_COPY));
    if (cfg.model && cfg.status) {
      row.appendChild(el('div', 'wait-note', (LM_PROVIDER_LABEL[cfg.provider] || cfg.provider) + ' · ' + cfg.model + '. English: ' + fmtLm(cfg.status.en) + '. Hebrew: ' + fmtLm(cfg.status.he) + '.'));
    }
    const note = el('p', 'wait-note');
    note.hidden = true;
    const say = (t) => { note.hidden = !t; note.textContent = t || ''; };

    const provider = document.createElement('select');
    provider.setAttribute('aria-label', 'Program');
    Object.keys(LM_PROVIDER_LABEL).forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = LM_PROVIDER_LABEL[k]; if (k === cfg.provider) o.selected = true; provider.appendChild(o); });
    const model = document.createElement('input');
    model.type = 'text'; model.placeholder = 'Model name, e.g. llama3:8b'; model.value = cfg.model || ''; model.setAttribute('aria-label', 'Model name'); model.setAttribute('list', 'lm-models'); model.maxLength = 120;
    const listEl = document.createElement('datalist'); listEl.id = 'lm-models';
    const current = () => ({ provider: provider.value, baseUrl: '', model: model.value.trim() });
    const need = (c) => {
      const n = FlowLocalLMServer.normalizeConfig(c);
      const pat = FlowLocalLMServer.originPattern(c.model ? c : Object.assign({}, c, { model: 'x' }));
      return { n, pat };
    };
    const askPermission = async (pat) => {
      if (!pat) return false;
      try {
        if (typeof chrome === 'undefined' || !chrome.permissions || !chrome.permissions.request) return true;
        if (chrome.permissions.contains && await chrome.permissions.contains({ origins: [pat] })) return true;
        return await chrome.permissions.request({ origins: [pat] });
      } catch (e) { return false; }
    };

    const acts = el('div', 'wait-acts');
    const find = el('button', 'ghost sm', 'Find models');
    find.type = 'button';
    find.addEventListener('click', async () => {
      const { pat } = need(current());
      if (!(await askPermission(pat))) { say('The browser did not allow Glance to reach this computer’s model server, so it stays off.'); return; }
      find.disabled = true; say('Looking…');
      const r = await FlowLocalLMServer.listModels({ provider: provider.value }, { fetch: (u, o) => fetch(u, o) });
      find.disabled = false;
      if (!r.ok) { say(r.hint || 'Could not reach it.'); return; }
      listEl.replaceChildren();
      r.models.forEach((m) => { const o = document.createElement('option'); o.value = m; listEl.appendChild(o); });
      if (r.models.length && !model.value) model.value = r.models[0];
      say(r.models.length ? 'Found ' + r.models.length + ' model' + (r.models.length === 1 ? '' : 's') + '. Pick one, then Test and turn on.' : 'The server is running but has no models yet. Pull one first (for Ollama: ollama pull llama3).');
    });
    const test = el('button', 'ghost sm', on ? 'Test again' : 'Test and turn on');
    test.type = 'button';
    test.addEventListener('click', async () => {
      const c = current();
      const { n, pat } = need(c);
      if (!n) { say(c.model ? 'That address is not allowed: only a program on this computer.' : 'Type the model name first (or press Find models).'); return; }
      if (!(await askPermission(pat))) { say('The browser did not allow Glance to reach this computer’s model server, so it stays off.'); return; }
      test.disabled = true; find.disabled = true;
      say('Testing this model on sentences written for the purpose. This can take a few minutes: keep this panel open.');
      const session = FlowLocalLMServer.session(n, { fetch: (u, o) => fetch(u, o), timeoutMs: 60000 });
      const probe = await FlowLocalLMServer.listModels(n, { fetch: (u, o) => fetch(u, o) });
      if (!probe.ok) { test.disabled = false; find.disabled = false; say(probe.hint || 'Could not reach it.'); return; }
      if (probe.models.length && probe.models.indexOf(n.model) < 0) { test.disabled = false; find.disabled = false; say('The server does not have a model called ' + n.model + '. Pick one from the list.'); return; }
      let res;
      try {
        res = await FlowLocalLM.selfTest(session, typeof FlowLocalLMAudit !== 'undefined' ? FlowLocalLMAudit : [], { now: Date.now(), onProgress: (lang, i, total) => { if (i % 10 === 0) say('Testing ' + (lang === 'he' ? 'Hebrew' : 'English') + ': ' + i + ' of ' + total + '. Keep this panel open.'); } });
      } catch (e) { res = null; }
      const pass = Boolean(res && ((res.en && res.en.ok) || (res.he && res.he.ok)));
      await FlowStorage.setLocalLmServer({ enabled: pass, provider: n.provider, baseUrl: n.baseUrl, model: n.model, status: res ? Object.assign({}, res, { provider: n.provider, baseUrl: n.baseUrl, model: n.model, nextCheckAt: res.checkedAt + FlowLocalLM.TEST_MAX_AGE_MS, reason: pass ? 'passed' : 'failed' }) : null });
      await renderSurfaces();
    });
    acts.appendChild(find); acts.appendChild(test);
    if (cfg.enabled) {
      const off = el('button', 'ghost sm', 'Turn off');
      off.type = 'button';
      off.addEventListener('click', async () => { off.disabled = true; await FlowStorage.setLocalLmServer(Object.assign({}, cfg, { enabled: false })); await renderSurfaces(); });
      acts.appendChild(off);
    }
    const inputs = el('div', 'wait-acts');
    inputs.appendChild(provider); inputs.appendChild(model); inputs.appendChild(listEl);
    row.appendChild(inputs);
    row.appendChild(acts);
    row.appendChild(note);
    host.appendChild(row);
  }

  // What Outlook is waiting on the person to answer: new offers, and questions that need a yes or a no.
  async function renderOutlookCards() {
    const block = document.getElementById('outlookBlock');
    const o = outlook();
    if (!block || !o) return;
    const pend = (await FlowStorage.get()).outlookPending || { offers: [], asks: [], incoming: [] };
    const host = document.getElementById('outlook-card');
    host.replaceChildren();
    // Incoming asks render once in the unified Loops list (Still Open + receipts).
    // From Outlook keeps only follow-up offers and yes/no asks.
    const offers = pend.offers || [], asks = pend.asks || [];
    block.hidden = offers.length + asks.length === 0;
    const mk = (label, fn) => { const b = el('button', 'ghost sm', label); b.type = 'button'; b.addEventListener('click', async () => { b.disabled = true; await fn(); await renderOutlookCards(); await renderWaiting(); if (typeof renderOpen === 'function') await renderOpen(); }); return b; };
    for (const x of offers) {
      const item = el('div', 'wait-item');
      const top = el('div', 'wait-top');
      top.appendChild(el('span', 'wait-who', (x.base.counterpart && (x.base.counterpart.name || x.base.counterpart.email)) || 'Outlook'));
      top.appendChild(el('span', 'wait-state', x.ask.direction === 'mine' ? 'You promised something' : 'Waiting on a reply?'));
      item.appendChild(top);
      item.appendChild(el('div', 'wait-what', '\u201c' + x.ask.what + '\u201d'));
      const acts = el('div', 'wait-acts');
      acts.appendChild(mk(x.ask.direction === 'mine' ? 'Remind me' : 'Stay on it', () => o.acceptOffer(x.key)));
      acts.appendChild(mk('Not now', () => o.declineOffer(x.key)));
      item.appendChild(acts);
      host.appendChild(item);
    }
    for (const x of asks) {
      const item = el('div', 'wait-item');
      const top = el('div', 'wait-top');
      top.appendChild(el('span', 'wait-who', 'Outlook'));
      top.appendChild(el('span', 'wait-state', x.title));
      item.appendChild(top);
      item.appendChild(el('div', 'wait-what', x.detail));
      const acts = el('div', 'wait-acts');
      acts.appendChild(mk('Yes, close it', () => o.answerAsk(x.key, true)));
      acts.appendChild(mk('Not yet', () => o.answerAsk(x.key, false)));
      item.appendChild(acts);
      host.appendChild(item);
    }
  }

  // On open and every ten minutes while the panel is open (the runner itself refuses to check more often than that).
  async function outlookAutoSync() {
    const o = outlook();
    if (!o) return;
    const st = await o.status();
    if (!st.connected || st.needsSignIn) return;
    const r = await o.sync();
    if (r.ok && !r.skipped) { await renderSurfaces(); await renderOutlookCards(); await renderWaiting(); if (typeof renderOpen === "function") await renderOpen(); }
    if (!outlookAutoSync.timer) outlookAutoSync.timer = setInterval(() => { outlookAutoSync().catch(() => {}); }, 10 * 60 * 1000 + 5000);
  }

  // A reminder ticked done in Google Tasks closes its loop: the person closed it themselves, on whatever device they had.
  // One status read per reminder, at most every ten minutes, only while this panel is open.
  async function syncTaskCompletions() {
    if (!FlowFollowUp.taskRefsToCheck || !FlowFollowUp.closeFromTask) return;
    const asked = syncTaskCompletions.asked || (syncTaskCompletions.asked = {});
    const now = Date.now();
    const all = await FlowStorage.getWatches();
    const todo = FlowFollowUp.taskRefsToCheck(all, now, asked);
    if (!todo.length) return;
    todo.forEach((w) => { asked[w.id] = now; });
    const r = await send({ type: 'flow:follow-task-status', refs: todo.map((w) => w.taskRef) });
    if (!r || !r.ok) return;
    let changed = false;
    for (const st of r.statuses || []) {
      const w = todo.find((x) => x.taskRef.taskId === st.taskId);
      if (w && st.status === 'completed') { await FlowStorage.updateWatch(w.id, FlowFollowUp.closeFromTask(w, now)); changed = true; }
    }
    if (changed) await renderWaiting();
  }

  // ---- Where Glance watches (other apps, opt-in) -------------------------------------------------
  // Gmail is always on. Another app is off until you turn it on here: the browser asks for that one site (an optional permission,
  // nothing is asked at install), Glance registers its reader for it, and you can turn it off again at any time. A function
  // with a property for its wiring, not a let: it runs during init.
  const SURFACE_COPY = {
    whatsapp: 'Reads your one-to-one chats, only to see whether something you asked was answered. Never sends, types or opens anything; groups, lists and channels are ignored. Experimental: WhatsApp can change its page without notice, and Glance goes quiet if it cannot read it.'
  };
  async function renderSurfaces() {
    const host = document.getElementById('surface-list');
    if (!host) return;
    const st = await send({ type: 'flow:surface-status' });
    host.replaceChildren();
    if (!st || !st.ok) return;
    for (const id of Object.keys(st.surfaces || {})) {
      const s = st.surfaces[id];
      const row = el('div', 'wait-item');
      const top = el('div', 'wait-top');
      top.appendChild(el('span', 'wait-who', s.label));
      const bad = s.enabled && s.health && s.health.ok === false;
      top.appendChild(el('span', 'wait-state' + (bad ? '' : s.enabled ? ' ok' : ''), s.enabled ? (bad ? 'On, but its page is not recognised' : 'On') : 'Off'));
      row.appendChild(top);
      row.appendChild(el('div', 'wait-note', SURFACE_COPY[id] || ''));
      if (s.revoked) row.appendChild(el('div', 'wait-note', 'The browser permission was removed, so this is off.'));
      const note = el('p', 'wait-note');
      note.hidden = true;
      const acts = el('div', 'wait-acts');
      const btn = el('button', 'ghost sm', s.enabled ? 'Turn off' : 'Turn on');
      btn.type = 'button';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        if (s.enabled) { await send({ type: 'flow:surface-disable', id }); await renderSurfaces(); return; }
        let granted = false;
        try { granted = await chrome.permissions.request({ origins: s.origins }); } catch (e) { granted = false; }
        if (!granted) { btn.disabled = false; note.hidden = false; note.textContent = 'The browser did not grant access, so it stays off.'; return; }
        const r = await send({ type: 'flow:surface-enable', id });
        if (!r || !r.ok) { btn.disabled = false; note.hidden = false; note.textContent = 'Could not turn it on. Try again.'; return; }
        await renderSurfaces();
      });
      acts.appendChild(btn);
      row.appendChild(acts);
      row.appendChild(note);
      host.appendChild(row);
    }
    await renderOutlookRow(host);
    await renderLocalModelRow(host);
    await renderHybridRow(host);
    await renderLadderRow(host);
  }

  // Two entries that might be one person (the same full name in two apps): asked once, never merged on a guess.
  async function renderIdentityLinks() {
    const block = document.getElementById('identityBlock');
    if (!block || typeof FlowIdentity === 'undefined' || !FlowStorage.getIdentityGraph) return;
    const graph = await FlowStorage.getIdentityGraph();
    const links = FlowIdentity.pendingLinks(graph).slice(0, 1);
    const host = document.getElementById('identity-card');
    host.replaceChildren();
    block.hidden = links.length === 0;
    for (const l of links) {
      const a = FlowIdentity.personOf(graph, l.a), b = FlowIdentity.personOf(graph, l.b);
      if (!a || !b) continue;
      const lab = (p, ch) => (FlowChannel.label(ch) + ': ' + ((p.emails && p.emails[0]) || (p.phones && p.phones[0] ? '+' + p.phones[0] : p.names[0] || '')));
      const item = el('div', 'wait-item');
      const top = el('div', 'wait-top');
      top.appendChild(el('span', 'wait-who', l.name || 'Same person?'));
      top.appendChild(el('span', 'wait-state', 'Same person?'));
      item.appendChild(top);
      item.appendChild(el('div', 'wait-what', lab(a, l.channels[0]) + '  =  ' + lab(b, l.channels[1])));
      const acts = el('div', 'wait-acts');
      const mk = (label, same) => { const x = el('button', 'ghost sm', label); x.type = 'button'; x.addEventListener('click', async () => { await FlowStorage.answerIdentity(l.a, l.b, same); await renderIdentityLinks(); }); return x; };
      acts.appendChild(mk('Yes, the same', true));
      acts.appendChild(mk('No, different people', false));
      item.appendChild(acts);
      host.appendChild(item);
    }
  }

  // ---- One question (core/active-question.js) ------------------------------------------------
  // At most one, rationed by the core. A yes opens the loop (the free limit applies) and is a label for the
  // on-device model; a no is a gentler label; the x skips. Functions with properties, not lets (init order).
  async function teachFromPopup(text, label, rate) {
    try {
      if (typeof FlowIntentModel === 'undefined' || !FlowIntentModel.ready()) return;
      FlowIntentModel.setAdaptation(await FlowStorage.getIntentAdapt());
      FlowIntentModel.learn(text, 'act', label, rate);
      await FlowStorage.setIntentAdapt(FlowIntentModel.getAdaptation());
    } catch (e) { /* learning is optional */ }
  }

  async function renderQuestion() {
    const block = document.getElementById('questionBlock');
    if (!block || typeof FlowActiveQuestion === 'undefined' || !FlowStorage.getActiveQuestion) return;
    const now = Date.now();
    const state = FlowActiveQuestion.active(await FlowStorage.getActiveQuestion(), now);
    const p = state.pending;
    const host = document.getElementById('question-card');
    host.replaceChildren();
    block.hidden = !p;
    if (!p) return;
    const item = el('div', 'wait-item');
    const top = el('div', 'wait-top');
    top.appendChild(el('span', 'wait-who', p.counterpart && (p.counterpart.name || p.counterpart.email) || 'Your message'));
    top.appendChild(el('span', 'wait-state', FlowActiveQuestion.questionText(p)));
    item.appendChild(top);
    item.appendChild(el('div', 'wait-what', '\u201c' + p.sentence + '\u201d'));
    const note = el('p', 'wait-note');
    note.hidden = true;
    const acts = el('div', 'wait-acts');
    const finish = async (ans) => {
      const res = FlowActiveQuestion.answer(state, ans, Date.now());
      if (ans === 'yes') {
        const list = await FlowStorage.getWatches();
        const status = await send({ type: 'flow:pro-status' });
        const gate = FlowEntitlements.watchGate(list.filter(FlowFollowUp.isActive).length, status && status.record, Date.now());
        if (!gate.allowed) { note.hidden = false; note.textContent = 'You are following ' + gate.used + ' of ' + gate.cap + ' open loops. Close one first, or see Glance Pro.'; return; }
        let ask = FlowActiveQuestion.askFor(p, FlowFollowUp.chaseDate('reply', null, Date.now()));
        if (ask.direction === 'theirs') ask = FlowFollowUp.personalChase(ask, list, p.counterpart && p.counterpart.email, Date.now());
        const watch = FlowFollowUp.buildWatch({ ask, threadId: p.threadId, messageId: p.messageId, subject: p.subject, counterpart: p.counterpart, now: Date.now() });
        watch.threadUrl = p.threadUrl || null;
        if (!list.some((w) => w.id === watch.id && FlowFollowUp.isActive(w))) {
          const made = await send({ type: 'flow:follow-task', payload: { title: FlowFollowUp.taskTitle(watch), dueIso: watch.chaseIso, what: watch.what, counterpart: p.counterpart && (p.counterpart.name ? p.counterpart.name + (p.counterpart.email ? ' <' + p.counterpart.email + '>' : '') : p.counterpart.email), threadUrl: watch.threadUrl } });
          if (made && made.ok && made.ref) watch.taskRef = made.ref;
          await FlowStorage.upsertWatch(watch);
        }
      }
      if (res.teach) {
        await teachFromPopup(p.sentence, res.teach.label, res.teach.rate);
        if (typeof FlowLedger !== 'undefined' && FlowStorage.appendLedger) { const e = FlowLedger.make('answered', { text: p.sentence, counterpart: p.counterpart, yes: ans === 'yes' }, Date.now()); if (e) FlowStorage.appendLedger(e).catch(() => {}); }
      }
      await FlowStorage.setActiveQuestion(res.state);
      await renderQuestion();
      await renderWaiting();
      if (renderLedger) await renderLedger();
    };
    const mk = (label, ans) => { const b = el('button', 'ghost sm', label); b.type = 'button'; b.addEventListener('click', () => { finish(ans); }); return b; };
    acts.appendChild(mk(p.kind === 'promise' ? 'Yes, remind me' : 'Yes, stay on it', 'yes'));
    acts.appendChild(mk('No', 'no'));
    acts.appendChild(mk('Skip', 'skip'));
    item.appendChild(acts);
    item.appendChild(note);
    host.appendChild(item);
  }

  async function renderWaiting() {
    const all = await FlowStorage.getWatches();
    const now = Date.now();
    const active = all.filter(FlowFollowUp.isActive)
      .sort((a, b) => (a.chaseIso || '').localeCompare(b.chaseIso || ''));
    const block = document.getElementById('waitingBlock');
    block.hidden = active.length === 0;
    const recent = FlowFollowUp.recentlyClosed(all, now, 5);
    document.getElementById('onYouLabel').hidden = active.length === 0 && recent.length === 0;
    if (!all.length) {
      document.getElementById('closedBlock').hidden = true;
      await renderDebrief(0, null, now);
      await renderRecurrence(false, now);
      return;
    }

    const status = await send({ type: 'flow:pro-status' });
    const record = status && status.record;
    const pro = FlowEntitlements.isActive(record, now);
    renderClosed(recent, active.length, record, now);
    await renderDebrief(active.length, record, now);
    await renderRecurrence(pro, now);
    if (!active.length) return;

    const sum = FlowFollowUp.summarize(all, now);
    const line = document.getElementById('waitingSummary');
    line.replaceChildren();
    const segs = [[String(sum.active), ' open']];
    if (sum.overdue) segs.push([String(sum.overdue), ' overdue']);
    if (sum.youOwe) segs.push([String(sum.youOwe), ' you promised']);
    if (sum.atRisk) segs.push([String(sum.atRisk), ' likely to slip' + (pro && sum.moneyAtRisk.length ? ' (' + sum.moneyAtRisk.map(FlowFollowUp.formatMoney).join(' + ') + ')' : '')]);
    const payments = active.filter((w) => w.kind === 'payment' && w.amount && w.amount.value > 0);
    if (payments.length && pro) segs.push(['owed to you ', sum.moneyOwed.map(FlowFollowUp.formatMoney).join(' + ')]);
    if (sum.closedThisMonth) segs.push([String(sum.closedThisMonth), ' closed this month']);
    if (pro && sum.paidThisMonth.length) segs.push(['paid ', sum.paidThisMonth.map(FlowFollowUp.formatMoney).join(' + ')]);
    segs.forEach((seg, i) => {
      if (i) line.appendChild(document.createTextNode(' · '));
      // First part plain, second bold, except the leading count which is bold.
      if (/^\d/.test(seg[0])) { line.appendChild(el('b', null, seg[0])); line.appendChild(document.createTextNode(seg[1])); }
      else { line.appendChild(document.createTextNode(seg[0])); line.appendChild(el('b', null, seg[1])); }
    });

    const upsell = document.getElementById('waitingUpsell');
    upsell.hidden = true;
    if (payments.length && !pro) {
      upsell.hidden = false;
      upsell.textContent = plural(payments.length, 'payment is', 'payments are') + ' being chased. Glance Pro shows the total owed to you.';
    } else if (!pro && active.length >= FlowEntitlements.FREE_WATCH_CAP) {
      upsell.hidden = false;
      upsell.textContent = 'You are following all ' + FlowEntitlements.FREE_WATCH_CAP + ' free open loops. Glance Pro stays on every one until it is closed.';
    }

    const host = document.getElementById('waiting-list');
    host.replaceChildren();
    const toggle = document.getElementById('loopView');
    toggle.hidden = active.length < 2;
    if (loopView === 'person' && active.length > 1) {
      // One person across apps: the same Dana by email and on WhatsApp is one heading (core/identity-graph.js).
      let keyOf = null;
      if (typeof FlowIdentity !== 'undefined' && FlowStorage.getIdentityGraph) {
        const graph = await FlowStorage.getIdentityGraph();
        keyOf = (w) => { const a = FlowIdentity.aliasesOf(graph, Object.assign({ channel: w.channel }, w.counterpart || {})); return a.emails[0] || (a.phones[0] ? 'phone:' + a.phones[0] : null); };
      }
      for (const g of FlowFollowUp.groupByPerson(all, now, { keyOf })) {
        const head = el('div', 'person-head');
        head.appendChild(el('span', null, g.name));
        const bits = [plural(g.loops.length, 'open', 'open')];
        if (g.apps.length > 1 || (g.apps[0] && g.apps[0] !== 'gmail')) bits.push(g.apps.map((a) => (typeof FlowChannel !== 'undefined' ? FlowChannel.label(a) : a)).join(' + '));
        if (g.overdue) bits.push(g.overdue + ' overdue');
        if (g.youOwe) bits.push(g.youOwe + ' you promised');
        if (g.money.length && pro) bits.push('owes ' + g.money.map(FlowFollowUp.formatMoney).join(' + '));
        head.appendChild(el('small', null, bits.join(' · ')));
        host.appendChild(head);
        for (const w of g.loops) host.appendChild(waitingItem(w, now, record, all));
      }
    } else {
      for (const w of active) host.appendChild(waitingItem(w, now, record, all));
    }
  }

  // "By date" (default) or "By person": the same loops, two ways to look.
  function wireLoopView() {
    const toggle = document.getElementById('loopView');
    toggle.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', async () => {
      loopView = b.getAttribute('data-view');
      toggle.querySelectorAll('.seg-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      await renderWaiting();
    }));
  }

  function stageLabel(w, now) {
    const d = FlowFollowUp.daysOpen(w, now);
    const age = d === 0 ? 'opened today' : 'day ' + (d + 1);
    const stage = FlowFollowUp.stageOf(w);
    if (FlowFollowUp.isClock(w)) {
      const left = FlowExpiry.daysLeft(w.expiresIso, now);
      return left < 0 ? 'Lapsed ' + dayShort(w.expiresIso) : 'Ends ' + dayShort(w.expiresIso) + ' · ' + (left === 0 ? 'today' : left === 1 ? '1 day left' : left + ' days left');
    }
    // A request that takes several steps carries its own status line (core/resolution.js): the same words as the card in Gmail.
    if (w.resolution && w.resolution.line) return 'Owed to ' + whoLabel(w).split(' ')[0] + ' · ' + w.resolution.line + ' · ' + age;
    if (FlowFollowUp.isMine(w)) return 'You promised' + (w.preparedAt ? ' · draft ready' : '') + ' · ' + age;
    if (FlowFollowUp.deadlinePassed(w, now) && stage !== 'yours') return 'Deadline passed ' + dayShort(w.deadlineIso) + ' · ' + age;
    if (stage === 'yours') return 'Your turn · ' + (w.yoursReason === 'blocked' ? 'they could not open it' : 'they asked you something') + (w.preparedAt ? ' · draft ready' : '') + ' · ' + age;
    if (stage === 'promised' && w.promisedIso) return 'Promised ' + dayShort(w.promisedIso) + ' · ' + age;
    if (stage === 'nudged') return 'Chased ' + plural(w.nudges || 1, 'time', 'times') + ' · ' + age;
    return 'Waiting · ' + age;
  }

  // A function, not a const: renderWaiting() runs before a const down here would
  // be initialised (the same trap noted at the top of popupInit).
  function nudgeLabel(level) { return level === 2 ? 'Draft a firmer nudge' : level === 3 ? 'Draft a last nudge' : null; }

  // One quiet Drive lookup per promised file per popup session.
  // (A property on the function, not a const: renderWaiting() runs before a const down here
  // would be initialised, the same trap noted at the top of popupInit.)
  async function findPromiseFile(w) {
    const cache = findPromiseFile.cache || (findPromiseFile.cache = new Map());
    if (cache.has(w.id)) return cache.get(w.id);
    let pick = null;
    try {
      const found = await send({ type: 'flow:search-drive', query: FlowFilePath.driveQuery(w.file) });
      pick = FlowFilePath.pickDrive(w.file, found && found.ok ? found.files : null, {}, w.what);
    } catch (e) { pick = null; }
    cache.set(w.id, pick);
    return pick;
  }

  function waitingItem(w, now, record, all) {
    const state = FlowFollowUp.watchState(w, now);
    const isPay = w.kind === 'payment';
    const item = el('div', 'wait-item');
    const top = el('div', 'wait-top');
    top.appendChild(el('span', 'wait-who', whoLabel(w)));
    // How long this person usually takes, and whether this loop is likely to miss its date because of it.
    const risk = all ? FlowFollowUp.riskOf(all, w, now) : null;
    const usual = all ? FlowFollowUp.typicalDays(all, w, now) : null;
    top.appendChild(el('span', 'wait-state' + (state === 'overdue' ? ' overdue' : state === 'lapsed' ? ' lapsed' : ''), state === 'lapsed' ? 'Lapsed' : state === 'overdue' ? 'Overdue · ' + dayShort(w.chaseIso) : (FlowFollowUp.isClock(w) ? 'Look ' : FlowFollowUp.isYours(w) ? 'Answer ' : 'Chase ') + dayShort(w.chaseIso)));
    item.appendChild(top);
    item.appendChild(el('div', 'wait-meta', (w.channel && w.channel !== 'gmail' && typeof FlowChannel !== 'undefined' ? FlowChannel.label(w.channel) + ' · ' : '') + stageLabel(w, now) + (risk && risk.slip ? ' · likely to slip, ' + whoLabel(w).split(' ')[0] + ' usually takes ~' + Math.round(risk.typical) + ' days' : usual ? ' · usually ~' + usual + ' days' : '')));
    const what = el('div', 'wait-what');
    if (isPay && w.amount && w.amount.raw) what.appendChild(el('span', 'wait-amt', w.amount.raw + ' · '));
    what.appendChild(document.createTextNode(w.what));
    item.appendChild(what);
    const note = el('p', 'wait-note');
    note.hidden = true;
    const acts = el('div', 'wait-acts');

    if (!FlowFollowUp.isMine(w) && !FlowFollowUp.isClock(w) && !FlowFollowUp.isYours(w) && w.counterpart && w.counterpart.email) {
      const level = FlowFollowUp.nextNudgeLevel(w);
      const gate = FlowEntitlements.nudgeGate(level, record, now);
      const base = nudgeLabel(level) || (state === 'overdue' ? 'Draft a nudge' : 'Nudge now');
      const label = gate.allowed ? base : base + ' · Pro';
      const nudge = el('button', 'ghost sm', label);
      nudge.type = 'button';
      nudge.addEventListener('click', async () => {
        note.hidden = false;
        if (!gate.allowed) {
          note.replaceChildren(document.createTextNode('The firmer follow-ups are part of Glance Pro. The friendly first nudge stays free. '));
          const a = el('a', null, 'See Glance Pro');
          a.href = FlowEntitlements.PRICING_URL; a.target = '_blank'; a.rel = 'noopener';
          note.appendChild(a);
          return;
        }
        nudge.disabled = true; nudge.textContent = 'Drafting…';
        const res = await send({ type: 'flow:follow-draft', payload: { to: w.counterpart.email, toName: w.counterpart.name, subject: w.subject, body: await voiced(FlowFollowUp.nudgeText(w, level, now), w) } });
        nudge.disabled = false; nudge.textContent = label;
        if (res && res.ok) {
          note.textContent = 'A draft is waiting in Gmail. Nothing was sent. Send it and I will move the next look out.';
          send({ type: 'flow:track', event: 'follow_nudge_drafted', params: {} });
        } else {
          note.textContent = (res && res.reason === 'not-connected') ? 'Connect Google first (Setup tab).' : 'Could not create the draft. Try again.';
        }
      });
      acts.appendChild(nudge);
    } else if (!FlowFollowUp.isMine(w) && !FlowFollowUp.isClock(w) && !FlowFollowUp.isYours(w) && w.counterpart && !w.counterpart.email && (w.counterpart.phone || w.channel === 'whatsapp')) {
      // A chat has no draft folder: the nudge is copied, and you paste it yourself. Glance never types or sends in another app.
      const level = FlowFollowUp.nextNudgeLevel(w);
      const gate = FlowEntitlements.nudgeGate(level, record, now);
      const base = nudgeLabel(level) || 'Nudge now';
      const copy = el('button', 'ghost sm', (gate.allowed ? 'Copy a ' : 'Copy a firmer ') + 'nudge' + (gate.allowed ? '' : ' · Pro'));
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        note.hidden = false;
        if (!gate.allowed) {
          note.replaceChildren(document.createTextNode('The firmer follow-ups are part of Glance Pro. The friendly first nudge stays free. '));
          const a = el('a', null, 'See Glance Pro');
          a.href = FlowEntitlements.PRICING_URL; a.target = '_blank'; a.rel = 'noopener';
          note.appendChild(a);
          return;
        }
        try {
          await navigator.clipboard.writeText(await voiced(FlowFollowUp.nudgeText(w, level, now), w));
          note.textContent = 'Copied. Paste it into the chat yourself. Nothing was sent.';
          send({ type: 'flow:track', event: 'follow_nudge_copied', params: {} });
        } catch (e) { note.textContent = 'Could not copy. Try again.'; }
      });
      acts.appendChild(copy);
      if (w.counterpart.phone) {
        const open = el('a', 'ghost sm', 'Open the chat');
        open.href = 'https://wa.me/' + String(w.counterpart.phone).replace(/\D/g, '');
        open.target = '_blank'; open.rel = 'noopener';
        acts.appendChild(open);
      }
    }

    // One draft action, and a file only when there is exactly one right file. Preparing never
    // closes the loop: it stays yours (or still promised) until you actually send.
    async function writeDraft(btn, label, body, fileName, driveFileId) {
      note.hidden = false;
      btn.disabled = true; btn.textContent = 'Preparing…';
      const base = { to: w.counterpart.email, toName: w.counterpart.name, subject: w.subject };
      body = await voiced(body, w);
      let res = await send({ type: 'flow:follow-draft', payload: Object.assign({}, base, { body }, driveFileId ? { driveFileId } : {}) });
      let used = driveFileId ? fileName : null;
      if (driveFileId && res && res.reason === 'attach') {
        used = null;
        res = await send({ type: 'flow:follow-draft', payload: Object.assign({}, base, { body: FlowFollowUp.isMine(w) ? null : await voiced(FlowFollowUp.replyDraft(w, {}), w) }) });
        if (res && res.ok) note.textContent = 'A draft is waiting in Gmail, but I could not attach the file, so add it yourself. Nothing was sent.';
      }
      btn.disabled = false; btn.textContent = label;
      if (res && res.ok) {
        if (!(driveFileId && !used)) note.textContent = 'A draft is waiting in Gmail' + (used ? ' with ' + used : '') + '. Nothing was sent. ' + (FlowFollowUp.isMine(w) ? 'Send it and I will close this.' : 'Send it and I will go back to waiting for them.');
        FlowStorage.updateWatch(w.id, FlowFilePath.preparedPatch(Date.now(), used)).catch(() => {});
        send({ type: 'flow:track', event: used ? 'follow_file_prepared' : 'follow_reply_prepared', params: {} });
      } else {
        note.textContent = (res && res.reason === 'not-connected') ? 'Connect Google first (Setup tab).' : 'Could not create the draft. Try again.';
      }
    }

    if (FlowFollowUp.isYours(w) && w.counterpart && w.counterpart.email) {
      const fc = w.fileChoice && w.fileChoice.driveFileId ? w.fileChoice : null;
      const label = fc ? 'Prepare reply with file' : 'Prepare my reply';
      const prep = el('button', 'ghost sm', label);
      prep.type = 'button';
      if (fc) prep.title = fc.name;
      prep.addEventListener('click', () => writeDraft(prep, label, FlowFollowUp.replyDraft(w, { fileName: fc && fc.name }), fc && fc.name, fc && fc.driveFileId));
      acts.appendChild(prep);
    } else if (FlowFollowUp.isMine(w) && FlowFilePath.isFileBacked(w) && w.counterpart && w.counterpart.email) {
      // A promised file: look up the one Drive file, quietly. No confident match, no button.
      const fileBtn = el('button', 'ghost sm', 'Prepare reply with file');
      fileBtn.type = 'button';
      fileBtn.hidden = true;
      acts.appendChild(fileBtn);
      findPromiseFile(w).then((pick) => {
        if (!pick) return;
        fileBtn.hidden = false;
        fileBtn.title = pick.name;
        fileBtn.addEventListener('click', () => writeDraft(fileBtn, 'Prepare reply with file', FlowFollowUp.promiseDraft(w, { fileName: pick.name }), pick.name, pick.id));
      });
    }

    const mineLoop = FlowFollowUp.isMine(w);
    const clockLoop = FlowFollowUp.isClock(w);
    const done = el('button', 'ghost sm', clockLoop ? 'Handled' : mineLoop ? 'Mark kept' : isPay ? 'Mark paid' : 'Mark done');
    done.type = 'button';
    done.addEventListener('click', async () => {
      await FlowStorage.updateWatch(w.id, { status: 'resolved', resolvedAt: Date.now(), resolvedBy: 'manual', closedAs: clockLoop ? 'manual' : mineLoop ? 'kept' : isPay ? 'paid' : 'manual' });
      if (w.taskRef) send({ type: 'flow:follow-complete', ref: w.taskRef });
      send({ type: 'flow:track', event: 'follow_resolved', params: {} });
      await renderWaiting();
    });
    acts.appendChild(done);

    const stop = el('button', 'ghost sm', 'Stop tracking');
    stop.type = 'button';
    stop.addEventListener('click', async () => {
      await FlowStorage.updateWatch(w.id, { status: 'stopped', resolvedAt: Date.now(), resolvedBy: 'manual' });
      if (w.taskRef) send({ type: 'flow:follow-complete', ref: w.taskRef });
      await renderWaiting();
    });
    acts.appendChild(stop);
    item.appendChild(acts);
    item.appendChild(note);
    return item;
  }

  // ---- after a meeting: what came out of it -------------------------------------
  async function renderDebrief(activeCount, record, now) {
    const block = document.getElementById('debriefBlock');
    const host = document.getElementById('debrief-list');
    const due = (await FlowStorage.getMeetings()).filter((m) => FlowMeetingDebrief.isDue(m, now)).slice(0, 2);
    block.hidden = due.length === 0;
    host.replaceChildren();
    for (const m of due) {
      const item = el('div', 'wait-item');
      const top = el('div', 'wait-top');
      top.appendChild(el('span', 'wait-who', m.title));
      top.appendChild(el('span', 'wait-state', dayShort(m.dateIso)));
      item.appendChild(top);
      item.appendChild(el('div', 'wait-what', 'What came out of it? One line each, for example: Dana to send the contract by Friday, or I will share the deck.'));
      const text = el('textarea', 'debrief-text');
      text.setAttribute('aria-label', 'What came out of ' + m.title);
      text.setAttribute('rows', '3');
      item.appendChild(text);
      const note = el('p', 'wait-note');
      note.hidden = true;
      const acts = el('div', 'wait-acts');
      const add = el('button', 'ghost sm', 'Add to loops');
      add.type = 'button';
      add.addEventListener('click', async () => {
        const items = FlowMeetingDebrief.parse(text.value, { now: Date.now() });
        note.hidden = false;
        if (!items.length) { note.textContent = 'I could not find an action in that. Try "Name to do something by Friday" or "I will do something".'; return; }
        add.disabled = true;
        const made = await createDebriefLoops(m, items, activeCount, record);
        await FlowStorage.updateMeeting(m.id, { done: true });
        send({ type: 'flow:track', event: 'follow_tracked', params: {} });
        note.textContent = made.made + (made.made === 1 ? ' loop added.' : ' loops added.') + (made.capped ? ' The rest need Glance Pro (the free limit is ' + FlowEntitlements.FREE_WATCH_CAP + ' open loops).' : '');
        setTimeout(() => { renderWaiting(); }, 1400);
      });
      acts.appendChild(add);
      const none = el('button', 'ghost sm', 'Nothing came out of it');
      none.type = 'button';
      none.addEventListener('click', async () => { await FlowStorage.updateMeeting(m.id, { done: true }); await renderWaiting(); });
      acts.appendChild(none);
      item.appendChild(acts);
      item.appendChild(note);
      host.appendChild(item);
    }
  }

  async function createDebriefLoops(meeting, items, activeCount, record) {
    let made = 0, capped = false, used = activeCount;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const gate = FlowEntitlements.watchGate(used, record, Date.now());
      if (!gate.allowed) { capped = true; break; }
      const ask = {
        kind: 'reply', what: it.what, amount: null, deadlineIso: it.deadlineIso,
        chaseIso: FlowFollowUp.chaseDate('reply', it.deadlineIso, Date.now()),
        lang: it.lang, subtype: 'meeting', direction: it.direction
      };
      const watch = FlowFollowUp.buildWatch({ threadId: 'mtg:' + meeting.id + ':' + i, messageId: null, subject: meeting.title, counterpart: { email: null, name: it.owner }, ask, now: Date.now() });
      watch.threadUrl = meeting.threadUrl || null;
      const res = await send({ type: 'flow:follow-task', payload: { title: FlowFollowUp.taskTitle(watch), dueIso: watch.chaseIso, what: watch.what, counterpart: it.owner || null, threadUrl: watch.threadUrl } });
      if (res && res.ok && res.ref) watch.taskRef = res.ref;
      await FlowStorage.upsertWatch(watch);
      FlowStorage.recordLoopOpen(watch).catch(() => {});
      used++; made++;
    }
    return { made, capped };
  }

  // ---- things that come around again ----------------------------------------------
  async function renderRecurrence(pro, now) {
    const block = document.getElementById('recurBlock');
    const host = document.getElementById('recur-list');
    const upsell = document.getElementById('recurUpsell');
    const { history, acked } = await FlowStorage.getLoopHistory();
    const predicted = FlowRecurrence.predict(history, now, acked).slice(0, 3);
    block.hidden = predicted.length === 0;
    host.replaceChildren();
    upsell.hidden = true;
    if (!predicted.length) return;
    if (!pro) {
      upsell.hidden = false;
      upsell.textContent = 'Glance noticed ' + plural(predicted.length, 'thing that comes', 'things that come') + ' around again. Glance Pro shows what and when.';
      return;
    }
    for (const p of predicted) {
      const item = el('div', 'wait-item');
      const top = el('div', 'wait-top');
      top.appendChild(el('span', 'wait-who', p.label));
      top.appendChild(el('span', 'wait-state', 'Around ' + dayShort(p.nextIso)));
      item.appendChild(top);
      item.appendChild(el('div', 'wait-what', 'You have asked ' + FlowRecurrence.periodWords(p.periodDays) + ' (' + p.count + ' times).'));
      const acts = el('div', 'wait-acts');
      const remind = el('button', 'ghost sm', 'Remind me');
      remind.type = 'button';
      remind.addEventListener('click', async () => {
        await send({ type: 'flow:follow-task', payload: { title: 'Likely again: ' + p.label, dueIso: p.nextIso, what: 'You have asked ' + FlowRecurrence.periodWords(p.periodDays) + '.', counterpart: null, threadUrl: null } });
        await FlowStorage.ackRecurrence(p.key, p.nextIso);
        await renderWaiting();
      });
      acts.appendChild(remind);
      const skip = el('button', 'ghost sm', 'Not now');
      skip.type = 'button';
      skip.addEventListener('click', async () => { await FlowStorage.ackRecurrence(p.key, p.nextIso); await renderWaiting(); });
      acts.appendChild(skip);
      item.appendChild(acts);
      host.appendChild(item);
    }
  }

  // Closed lately, each with a Reopen. A loop closed by mistake (or one that
  // came back to life) goes straight back on the list.
  function renderClosed(recent, activeCount, record, now) {
    const block = document.getElementById('closedBlock');
    block.hidden = recent.length === 0;
    const host = document.getElementById('closed-list');
    host.replaceChildren();
    for (const w of recent) {
      const item = el('div', 'wait-item closed-item');
      const top = el('div', 'wait-top');
      const amt = w.kind === 'payment' && w.amount && w.amount.raw ? w.amount.raw + ' · ' : '';
      top.appendChild(el('span', 'wait-who', whoLabel(w)));
      const days = FlowFollowUp.daysOpen(w, w.resolvedAt || now);
      top.appendChild(el('span', 'wait-state ok', (w.closedAs === 'paid' ? 'Paid' : w.closedAs === 'kept' ? 'Kept' : w.closedAs === 'scheduled' ? 'Scheduled' : 'Closed') + (days >= 1 ? ' · ' + plural(days, 'day', 'days') : '')));
      item.appendChild(top);
      item.appendChild(el('div', 'wait-what', amt + w.what));
      const note = el('p', 'wait-note');
      note.hidden = true;
      const acts = el('div', 'wait-acts');
      const reopen = el('button', 'ghost sm', 'Reopen');
      reopen.type = 'button';
      reopen.addEventListener('click', async () => {
        const gate = FlowEntitlements.watchGate(activeCount, record, Date.now());
        if (!gate.allowed) {
          note.hidden = false;
          note.textContent = 'You are following ' + gate.used + ' of ' + gate.cap + ' open loops. Close one first, or see Glance Pro.';
          return;
        }
        const patch = FlowFollowUp.reopenPatch(w, Date.now());
        // Reopening a loop Glance closed by itself is a correction: it feeds the closure-quality rate.
        if ((w.resolvedBy === 'reply' || w.resolvedBy === 'delivered' || w.resolvedBy === 'signal') && FlowStorage.recordOutcomeLabel) FlowStorage.recordOutcomeLabel('reopened', w.id + '|' + (w.resolvedAt || '')).catch(() => {});
        await FlowStorage.updateWatch(w.id, patch);
        if (w.taskRef) {
          const r = await send({ type: 'flow:follow-reopen', ref: w.taskRef, dueIso: patch.chaseIso });
          if (r && r.reason === 'gone') {
            const next = Object.assign({}, w, patch);
            const cp = next.counterpart || {};
            const made = await send({ type: 'flow:follow-task', payload: { title: FlowFollowUp.taskTitle(next), dueIso: patch.chaseIso, what: next.what, counterpart: cp.name ? cp.name + (cp.email ? ' <' + cp.email + '>' : '') : cp.email, threadUrl: next.threadUrl || null } });
            if (made && made.ok && made.ref) await FlowStorage.updateWatch(w.id, { taskRef: made.ref });
          }
        }
        send({ type: 'flow:track', event: 'follow_reopened', params: {} });
        await renderWaiting();
      });
      acts.appendChild(reopen);
      item.appendChild(acts);
      item.appendChild(note);
      host.appendChild(item);
    }
  }

  function outlookReceiptRow(entry) {
    const item = el('div', 'log-item');
    const top = el('div', 'log-top');
    top.appendChild(el('span', 'log-label', entry.label || 'Reply draft ready in Outlook Drafts. Not sent.'));
    top.appendChild(el('span', 'log-kind written', 'Draft'));
    item.appendChild(top);
    item.appendChild(el('span', 'log-where', 'From Outlook'));
    if (entry.ts) item.appendChild(el('span', 'when', when(entry.ts)));
    const acts = el('div', 'log-acts');
    if (entry.url || entry.where) {
      const a = el('a', 'ghost sm', 'Open draft');
      a.href = entry.url || entry.where; a.target = '_blank'; a.rel = 'noopener';
      acts.appendChild(a);
    }
    const u = el('button', 'ghost sm', 'Undo');
    u.type = 'button';
    u.addEventListener('click', async () => {
      u.disabled = true; u.textContent = 'Undoing…';
      const o = outlook();
      const r = o ? await o.undoReplyDraft(entry.ref) : { ok: false };
      if (r && r.ok) {
        if (typeof FlowStorage.markOutlookDraftUndone === 'function') {
          await FlowStorage.markOutlookDraftUndone(entry.messageId, entry.ref);
        } else {
          await FlowStorage.appendLog({ kind: 'undone', label: entry.label, messageId: entry.messageId, app: 'outlook', connectorId: 'outlookDraft', ref: entry.ref });
        }
        // Draft undo is not a false close (prepared reply, not a trusted close).
        await FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: entry.messageId, draftOnly: true });
        if (typeof FlowCloseMemory !== 'undefined') await FlowCloseMemory.forgetMessage(entry.messageId);
        await renderOpen();
        await renderOutlookCards();
        await renderLog();
      } else {
        u.disabled = false; u.textContent = 'Undo';
      }
    });
    acts.appendChild(u);
    item.appendChild(acts);
    return item;
  }

  async function ensureOutlookMigrated() {
    if (ensureOutlookMigrated.done) return ensureOutlookMigrated.result;
    ensureOutlookMigrated.done = true;
    if (typeof FlowStorage.migrateOutlookDraftState === 'function') {
      try { ensureOutlookMigrated.result = await FlowStorage.migrateOutlookDraftState(); }
      catch (e) { ensureOutlookMigrated.result = { ok: false, error: String(e && e.message || e) }; }
    } else ensureOutlookMigrated.result = { skipped: true };
    return ensureOutlookMigrated.result;
  }

  async function reconcileOutlookReceiptsSafe() {
    const o = outlook();
    if (!o || typeof o.reconcileReceipts !== 'function') return null;
    try { return await o.reconcileReceipts(); }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  async function renderOpen() {
    await ensureOutlookMigrated();
    await reconcileOutlookReceiptsSafe();
    const pending = await FlowStorage.getStillOpen();
    const receipts = (typeof FlowStorage.getActiveOutlookReceipts === 'function')
      ? await FlowStorage.getActiveOutlookReceipts()
      : [];
    // Dedup: if a receipt exists for a messageId, skip the still-open card.
    const receiptIds = new Set(receipts.map((r) => r.messageId).filter(Boolean));
    const openOnly = pending.filter((e) => !receiptIds.has(e.messageId));
    const total = openOnly.length + receipts.length;
    chrome.runtime.sendMessage({ type: 'flow:pending-count', count: total });
    for (const item of openOnly) {
      FlowStorage.recordStillOpenMetric({ kind: 'shown', messageId: item.messageId })
        .catch((e) => console.error('[Glance] failed to record a Still Open card as shown', e));
    }

    const host = document.getElementById('open-list');
    const empty = document.getElementById('open-empty');
    host.replaceChildren();
    empty.hidden = total > 0;
    receipts.forEach((entry) => host.appendChild(outlookReceiptRow(entry)));
    openOnly.forEach((entry) => host.appendChild(openRow(entry)));
  }

  function when(ts) {
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return new Date(ts).toLocaleDateString();
  }

  // Showing the sensitivity is not a setting — it is a read-out. It exists so the
  // adaptation is visible rather than mysterious.
  function renderSensitivity(s) {
    const wrap = document.getElementById('sense');
    const c = s.calibration || { clicks: 0, dismissals: 0 };
    if (!c.clicks && !c.dismissals) { wrap.hidden = true; return; }
    const t = FlowJudgment.thresholdFrom(c);
    const span = FlowJudgment.MAX_THRESHOLD - FlowJudgment.MIN_THRESHOLD;
    const talkative = 1 - (t - FlowJudgment.MIN_THRESHOLD) / span;
    document.getElementById('senseFill').style.width = Math.round(talkative * 100) + '%';
    document.getElementById('senseNote').textContent =
      t <= FlowJudgment.BASE_THRESHOLD - 4 ? 'Speaking up more — you keep clicking'
      : t >= FlowJudgment.BASE_THRESHOLD + 6 ? 'Holding back — you keep dismissing'
      : 'Balanced';
    wrap.hidden = false;
  }

  // The product is deliberately silent between chips, and a silent tool is
  // easy to forget you installed. This is the one place that answers "is it
  // actually doing anything" without turning into a notification.
  // Both numbers come from storage.js's writeCountsFrom — the single
  // definition, sitting next to the data. They used to be derived here from
  // the 200-entry activity log, which made "all-time" GO DOWN as old rows
  // were evicted (one Do It appends up to five 'written' rows, so ~40
  // multi-step closes rolled the whole window) and undercounted "this week"
  // for anyone closing more in a week than the log could hold. A counter that
  // shrinks is not a rounding error — it is the product stating something it
  // knows is false.
  function renderWeekStat(s) {
    const wrap = document.getElementById('weekStat');
    const counts = FlowStorage.writeCountsFrom(s);
    if (!counts.total) { wrap.hidden = true; return; }
    document.getElementById('weekCount').textContent = counts.week;
    document.getElementById('weekLabel').textContent = ' logged this week';
    document.getElementById('weekTotal').textContent = counts.total + ' all-time';
    wrap.hidden = false;
  }

  // Compounding value made visible: how many (process, step) preferences
  // Execution Memory has actually learned and acted on for this account —
  // not a raw click count (weekStat above already shows that), but real
  // adjustments to what Glance proposes next. Reuses FlowActions.isNetRejected()
  // rather than a second definition of "learned," so this claim can never
  // disagree with the exact math applyMemory() uses to actually demote a
  // step. A step the person explicitly pinned counts too — that is still
  // Glance's behavior having adapted for this account, the correction just
  // came from a direct answer instead of an inference (see recordPin's own
  // comment in execution-memory.js). Zero is a real, common state (a new
  // install, or one that has never removed or pinned a step) and stays
  // hidden rather than announcing "0 things learned," which would read as
  // the product failing at the one thing this line exists to reassure
  // about — see the Magic Moment's own "nothing to prove yet" precedent.
  // "What Glance learned from you" (core/learning-ledger.js): the last few adjustments, in plain words, and a reset.
  // A function with a property, not a let: it runs during init, before a later `let` would initialise.
  // Whether the language model built into this browser is reading unusual wording for Glance, said plainly.
  // It is only ever on after it passed a precision check on this device (core/local-lm.js).
  async function renderLmStat() {
    const wrap = document.getElementById('lmStat');
    if (!wrap || !FlowStorage.getLocalLm) return;
    const st = await FlowStorage.getLocalLm();
    if (!st || !st.checkedAt) { wrap.hidden = true; return; }
    const on = [st.en && st.en.ok ? 'English' : null, st.he && st.he.ok ? 'Hebrew' : null].filter(Boolean);
    if (on.length) wrap.textContent = 'The model built into this browser also reads wording nothing else recognises, for ' + on.join(' and ') + ' (it passed a precision check on this device). It only suggests; you decide.';
    else if (st.reason === 'failed') wrap.textContent = 'The model built into this browser did not pass the precision check on this device, so it stays off.';
    else { wrap.hidden = true; return; }
    wrap.hidden = false;
  }

  async function renderLedger() {
    const block = document.getElementById('ledgerBlock');
    if (!block || typeof FlowLedger === 'undefined' || !FlowStorage.getLedger) return;
    const list = await FlowStorage.getLedger();
    block.hidden = list.length === 0;
    const host = document.getElementById('ledger-list');
    host.replaceChildren();
    for (const e of FlowLedger.recent(list, 8)) {
      const row = el('div', 'wait-item');
      row.appendChild(el('div', 'wait-what', e.line));
      row.appendChild(el('div', 'wait-note', new Date(e.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })));
      host.appendChild(row);
    }
    const btn = document.getElementById('ledgerReset');
    if (!renderLedger.wired) {
      renderLedger.wired = true;
      btn.addEventListener('click', async () => {
        await FlowStorage.resetLearning();
        await renderLedger();
    await renderLmStat();
        const stat = document.getElementById('learnedStat');
        if (stat) stat.hidden = true;
      });
    }
  }

  async function renderLearned() {
    const wrap = document.getElementById('learnedStat');
    if (typeof FlowExecutionMemory === 'undefined' || typeof FlowActions === 'undefined') { wrap.hidden = true; return; }
    const mem = await FlowExecutionMemory.getAll();
    let count = 0;
    for (const processId of Object.keys(mem)) {
      const steps = (mem[processId] && mem[processId].steps) || {};
      for (const stepKind of Object.keys(steps)) {
        const s = steps[stepKind];
        if ((s.pinned || 0) > 0 || FlowActions.isNetRejected(s)) count++;
      }
    }
    if (!count) { wrap.hidden = true; return; }
    wrap.textContent = 'Glance has adjusted ' + count + (count === 1 ? ' thing' : ' things') + ' about how it works for you.';
    wrap.hidden = false;
  }

  // STEP_NOUNS lives near currentInsight at the top of this function now —
  // see the comment there for why.

  // Execution Memory made visible: at most one insight shown at a time
  // (never a pile of things to review), and only ever for a (process, step)
  // combo that (a) actions.js's own applyMemory() is already demoting for a
  // real reason and (b) hasn't already gotten a real answer from this
  // person. Confirming or rejecting both close it permanently — this is a
  // one-time correction opportunity, not a recurring setting.
  // (currentInsight itself is declared at the top of popupInit — see that
  // declaration's own comment for why it can't live here.)

  async function renderMemoryInsight(s) {
    const wrap = document.getElementById('memoryInsight');
    if (typeof FlowExecutionMemory === 'undefined' || typeof FlowActions === 'undefined') { wrap.hidden = true; return; }

    const mem = await FlowExecutionMemory.getAll();
    const seen = new Set(s.memoryInsightsSeen || []);
    currentInsight = null;

    outer:
    for (const processId of Object.keys(mem)) {
      const catalogEntry = FlowActions.PROCESS_CATALOG[processId];
      if (!catalogEntry) continue;
      for (const stepKind of catalogEntry.stepKinds) {
        if (stepKind === catalogEntry.anchor) continue; // never surfaced — see actions.js's own anchor comment
        const key = processId + ':' + stepKind;
        if (seen.has(key)) continue;
        if (FlowActions.isNetRejected(mem[processId].steps[stepKind])) {
          currentInsight = { processId, stepKind, key, processName: catalogEntry.name };
          break outer;
        }
      }
    }

    if (!currentInsight) { wrap.hidden = true; return; }

    document.getElementById('memoryInsightText').textContent =
      'Glance noticed you usually remove ' + (STEP_NOUNS[currentInsight.stepKind] || 'a step') +
      ' in ' + currentInsight.processName + ' processes — keep it that way?';
    wrap.hidden = false;
  }

  function wireMemoryInsight() {
    document.getElementById('memoryInsightConfirm').addEventListener('click', async () => {
      if (!currentInsight) return;
      await FlowStorage.markMemoryInsightSeen(currentInsight.key);
      document.getElementById('memoryInsight').hidden = true;
      currentInsight = null;
    });
    document.getElementById('memoryInsightReject').addEventListener('click', async () => {
      if (!currentInsight) return;
      // The one real lever here: pin the step so actions.js's applyMemory()
      // stops demoting it, regardless of whatever removed/undone counts
      // came before — a direct "no" outranks the inference that produced
      // this card in the first place.
      await FlowExecutionMemory.recordPin(currentInsight.processId, currentInsight.stepKind);
      await FlowStorage.markMemoryInsightSeen(currentInsight.key);
      document.getElementById('memoryInsight').hidden = true;
      currentInsight = null;
    });
  }
  wireMemoryInsight();

  // Earns its place after real usage rather than nagging on first open —
  // three real writes is evidence Glance is actually working for this person,
  // which is the only moment "tell a teammate" is credible instead of noise.
  // Dismissing it is permanent; it never reappears once the user has said no.
  function renderReferral(s) {
    const wrap = document.getElementById('referral');
    // Distinct messages, via the same storage.js counter the stat row above
    // uses. This gate used to count raw 'written' rows, so ONE Do It on a
    // three-step process satisfied "three real writes" by itself — asking
    // someone to recommend the product after a single click is precisely the
    // nag the three-write threshold exists to avoid.
    const total = FlowStorage.writeCountsFrom(s).total;
    if (s.referralDismissed || total < 3) { wrap.hidden = true; return; }
    wrap.hidden = false;
  }

  function wireReferral() {
    document.getElementById('referralDismiss').addEventListener('click', async () => {
      await FlowStorage.set({ referralDismissed: true });
      document.getElementById('referral').hidden = true;
    });
    document.getElementById('referralCopy').addEventListener('click', async () => {
      const btn = document.getElementById('referralCopy');
      try {
        // The install id doubles as the referral code — it's already a
        // random, non-identifying local value (see storage.js), so reusing
        // it here means a share can actually be attributed back to this
        // install without adding a second identifier to track.
        const code = await FlowStorage.getInstallId();
        await navigator.clipboard.writeText('https://theflow-ai.com/trial.html?ref=' + code);
        const original = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = original; }, 1800);
      } catch (e) {
        btn.textContent = 'https://theflow-ai.com/trial.html';
      }
    });
    // The same real, working setup this account already has, exported as
    // the exact .glance file the Setup tab's own Export button produces
    // (see exportRecipe()) — a teammate imports it and matches this
    // connector in one drop, no separate onboarding conversation. This
    // is a second path inside the SAME earned-trust card rather than a
    // second dismissible surface: two independent "tell someone" prompts
    // stacking after the same threshold would read as being asked twice.
    document.getElementById('referralExportRecipe').addEventListener('click', () => {
      const btn = document.getElementById('referralExportRecipe');
      exportRecipe();
      const original = btn.textContent;
      btn.textContent = 'Exported';
      setTimeout(() => { btn.textContent = original; }, 1800);
    });
  }
  wireReferral();
  wireClearCloseMemory();

  function wireClearCloseMemory() {
    const btn = document.getElementById('clearCloseMemory');
    if (!btn || typeof FlowCloseMemory === 'undefined') return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await FlowCloseMemory.clear();
      const original = btn.textContent;
      btn.textContent = 'Cleared';
      setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 1600);
    });
  }

  function renderCloseQuality(s) {
    const node = document.getElementById('closeQuality');
    if (!node) return;
    if (typeof FlowCloseQuality === 'undefined') { node.hidden = true; return; }
    const line = FlowCloseQuality.activityLine(FlowCloseQuality.computeSnapshot(s.closeQuality));
    if (!line) { node.hidden = true; return; }
    node.textContent = line;
    node.hidden = false;
  }

  function renderQuiet(s) {
    const node = document.getElementById('quietMetrics');
    if (!node) return;
    if (typeof FlowQuietMetrics === 'undefined') { node.hidden = true; return; }
    const line = FlowQuietMetrics.activityLine(FlowQuietMetrics.snapshot(s.quietMetrics));
    if (!line) { node.hidden = true; return; }
    node.textContent = line;
    node.hidden = false;
  }

  function renderStillOpenQuality(s) {
    const node = document.getElementById('stillOpenQuality');
    if (!node) return;
    if (typeof FlowStillOpen === 'undefined') { node.hidden = true; return; }
    const line = FlowStillOpen.activityLine(s.stillOpenMetrics || FlowStillOpen.emptyMetrics());
    if (!line) { node.hidden = true; return; }
    node.textContent = line;
    node.hidden = false;
  }

  async function renderLog() {
    await ensureOutlookMigrated();
    const s = await FlowStorage.get();
    renderWeekStat(s);
    renderCloseQuality(s);
    renderQuiet(s);
    renderStillOpenQuality(s);
    await renderLearned();
    await renderLedger();
    renderSensitivity(s);
    await renderMemoryInsight(s);
    renderReferral(s);
    const host = document.getElementById('log-list');
    const empty = document.getElementById('log-empty');
    host.replaceChildren();
    // "shown" entries are noise once the outcome is known; the log should read as
    // a record of what happened, not a stream of every evaluation.
    const rows = (s.log || []).filter((e) => e.kind !== 'shown').slice(0, 40);
    empty.hidden = rows.length > 0;
    rows.forEach((e) => host.appendChild(logRow(e)));
  }

  function logRow(e) {
    const item = el('div', 'log-item');
    const top = el('div', 'log-top');
    top.appendChild(el('span', 'log-label', e.label || '-'));
    // The stored kind stays 'written' - counters and CSS key off it. The
    // badge a person reads should say what the chip just said.
    const KIND_LABEL = { written: 'Handled', undone: 'Undone', clicked: 'Clicked', dismissed: 'Dismissed' };
    top.appendChild(el('span', 'log-kind ' + e.kind, KIND_LABEL[e.kind] || e.kind));
    item.appendChild(top);

    if (e.where) item.appendChild(el('span', 'log-where', 'Written to ' + e.where));
    item.appendChild(el('span', 'when', when(e.ts)));

    if (e.kind === 'written' && (e.url || e.ref)) {
      const acts = el('div', 'log-acts');
      let undoNote = null;
      if (e.url) {
        const a = el('a', 'ghost sm', e.connectorId === 'outlookDraft' ? 'Open draft' : 'View');
        a.href = e.url; a.target = '_blank'; a.rel = 'noopener';
        acts.appendChild(a);
      }
      if (e.ref) {
        const hintLine = FlowReceipt.undoHint(e.where ? [e.where] : []);
        const u = el('button', 'ghost sm', 'Undo');
        u.type = 'button';
        u.setAttribute('aria-label', hintLine);
        const note = el('span', 'log-undo-note', hintLine);
        undoNote = note;
        u.addEventListener('click', async () => {
          u.textContent = 'Undoing…';
          u.disabled = true;
          const r = await send({ type: 'flow:undo-action', connectorId: e.connectorId, ref: e.ref });
          if (r && r.ok) {
            const isOutlookDraft = e.connectorId === 'outlookDraft' || e.app === 'outlook';
            if (isOutlookDraft && typeof FlowStorage.markOutlookDraftUndone === 'function') {
              await FlowStorage.markOutlookDraftUndone(e.messageId, e.ref);
            } else {
              await FlowStorage.appendLog({ kind: 'undone', label: e.label, messageId: e.messageId, connectorId: e.connectorId, ref: e.ref, app: e.app });
            }
            if (typeof FlowCloseMemory !== 'undefined') await FlowCloseMemory.forgetMessage(e.messageId);
            if (e.messageId) {
              if (isOutlookDraft) {
                // Prepared draft undo is not a false close.
                await FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: e.messageId, draftOnly: true });
              } else {
                await FlowStorage.recordCloseQuality({ kind: 'falseDoIt', messageId: e.messageId, reason: 'undo' });
                await FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: e.messageId });
              }
            }
            await renderLog();
            if (typeof renderOpen === 'function') await renderOpen();
          } else {
            const line = FlowReceipt.reverseNote({ reversed: 0, remaining: 1, keptWhere: e.where });
            u.textContent = 'Undo';
            u.disabled = false;
            u.setAttribute('aria-label', line);
            note.textContent = line;
            note.className = 'log-undo-note log-undo-failed';
          }
        });
        acts.appendChild(u);
      }
      item.appendChild(acts);
      if (undoNote) item.appendChild(undoNote);
    }
    return item;
  }
})();
