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

  wireTabs();
  wireSave();
  wireRecipe();
  wirePro();
  renderConnectors();
  renderStatusPill();
  await renderLog();
  await renderOpen();
  await renderWaiting();


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

    const subtitle = pendingRowSubtitle(entry);
    if (subtitle) item.appendChild(el('span', 'log-where', subtitle));
    // "Make unresolved processes harder to forget" — an item open for three
    // weeks used to look identical to one from ten minutes ago in this
    // list. Same when()/.when the Activity tab's own logRow() already uses,
    // reused rather than a second age-formatting rule, on entry.ts —
    // appendLog stamps every row with ts unconditionally, 'shown' included.
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
    if (entry.threadUrl) {
      const view = el('a', 'ghost sm', 'View');
      view.href = entry.threadUrl; view.target = '_blank'; view.rel = 'noopener';
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


  // ---- Waiting on -----------------------------------------------------------
  // What the account asked others for and has not had answered. Free tracks
  // three at a time; Pro tracks all of them and adds the money line. Nothing
  // here reads mail: every record was made by the person clicking "Remind me".
  function dayShort(iso) {
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async function renderWaiting() {
    const block = document.getElementById('waitingBlock');
    const all = await FlowStorage.getWatches();
    const active = all.filter(FlowFollowUp.isActive)
      .sort((a, b) => (a.chaseIso || '').localeCompare(b.chaseIso || ''));
    block.hidden = active.length === 0;
    if (!active.length) return;

    const status = await send({ type: 'flow:pro-status' });
    const pro = FlowEntitlements.isActive(status && status.record, Date.now());
    const now = Date.now();
    const sum = FlowFollowUp.summarize(all, now);

    const line = document.getElementById('waitingSummary');
    line.replaceChildren();
    const parts = [el('b', null, String(sum.active)), document.createTextNode(' open')];
    if (sum.overdue) { parts.push(document.createTextNode(' · ')); parts.push(el('b', null, String(sum.overdue))); parts.push(document.createTextNode(' overdue')); }
    parts.forEach((n) => line.appendChild(n));
    const payments = active.filter((w) => w.kind === 'payment' && w.amount && w.amount.value > 0);
    const upsell = document.getElementById('waitingUpsell');
    upsell.hidden = true;
    if (payments.length && pro) {
      line.appendChild(document.createTextNode(' · owed to you '));
      line.appendChild(el('b', null, sum.moneyOwed.map(FlowFollowUp.formatMoney).join(' + ')));
    } else if (payments.length) {
      upsell.hidden = false;
      upsell.textContent = payments.length + (payments.length === 1 ? ' payment is' : ' payments are') + ' being chased. Glance Pro shows the total owed to you.';
    } else if (!pro && active.length >= FlowEntitlements.FREE_WATCH_CAP) {
      upsell.hidden = false;
      upsell.textContent = 'You are using all ' + FlowEntitlements.FREE_WATCH_CAP + ' free follow-ups. Glance Pro tracks as many as you have.';
    }

    const host = document.getElementById('waiting-list');
    host.replaceChildren();
    for (const w of active) host.appendChild(waitingItem(w, now));
  }

  function waitingItem(w, now) {
    const state = FlowFollowUp.watchState(w, now);
    const item = el('div', 'wait-item');
    const top = el('div', 'wait-top');
    top.appendChild(el('span', 'wait-who', FlowFollowUp.firstName(w.counterpart && w.counterpart.name, w.counterpart && w.counterpart.email) || (w.subject || 'Reply')));
    top.appendChild(el('span', 'wait-state' + (state === 'overdue' ? ' overdue' : ''), state === 'overdue' ? 'Overdue · ' + dayShort(w.chaseIso) : 'Chase ' + dayShort(w.chaseIso)));
    item.appendChild(top);
    const what = el('div', 'wait-what');
    if (w.kind === 'payment' && w.amount && w.amount.raw) what.appendChild(el('span', 'wait-amt', w.amount.raw + ' · '));
    what.appendChild(document.createTextNode(w.what));
    item.appendChild(what);
    const note = el('p', 'wait-note');
    note.hidden = true;
    const acts = el('div', 'wait-acts');
    if (w.counterpart && w.counterpart.email) {
      const nudge = el('button', 'ghost sm', state === 'overdue' ? 'Draft a nudge' : 'Nudge now');
      nudge.type = 'button';
      nudge.addEventListener('click', async () => {
        nudge.disabled = true; nudge.textContent = 'Drafting…';
        const res = await send({ type: 'flow:follow-draft', payload: { to: w.counterpart.email, toName: w.counterpart.name, subject: w.subject, body: FlowFollowUp.nudgeText(w) } });
        nudge.disabled = false; nudge.textContent = state === 'overdue' ? 'Draft a nudge' : 'Nudge now';
        note.hidden = false;
        if (res && res.ok) {
          note.textContent = 'A draft is waiting in Gmail. Nothing was sent.';
          await FlowStorage.updateWatch(w.id, { nudges: (w.nudges || 0) + 1 });
          send({ type: 'flow:track', event: 'follow_nudge_drafted', params: {} });
        } else {
          note.textContent = (res && res.reason === 'not-connected') ? 'Connect Google first (Setup tab).' : 'Could not create the draft. Try again.';
        }
      });
      acts.appendChild(nudge);
    }
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

  async function renderOpen() {
    const pending = await FlowStorage.getStillOpen();
    // The badge is the Still Open count, the same number the morning brief
    // posts. A restart can open this panel before any Gmail tab has run.
    chrome.runtime.sendMessage({ type: 'flow:pending-count', count: pending.length });
    for (const item of pending) {
      FlowStorage.recordStillOpenMetric({ kind: 'shown', messageId: item.messageId })
        .catch((e) => console.error('[Glance] failed to record a Still Open card as shown', e));
    }

    const host = document.getElementById('open-list');
    const empty = document.getElementById('open-empty');
    host.replaceChildren();
    empty.hidden = pending.length > 0;
    pending.forEach((entry) => host.appendChild(openRow(entry)));
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
    const s = await FlowStorage.get();
    renderWeekStat(s);
    renderCloseQuality(s);
    renderQuiet(s);
    renderStillOpenQuality(s);
    await renderLearned();
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
    top.appendChild(el('span', 'log-label', e.label || '—'));
    // The stored kind stays 'written' — counters and CSS key off it. The
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
        const a = el('a', 'ghost sm', 'View');
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
            await FlowStorage.appendLog({ kind: 'undone', label: e.label, messageId: e.messageId });
            if (typeof FlowCloseMemory !== 'undefined') await FlowCloseMemory.forgetMessage(e.messageId);
            if (e.messageId) {
              await FlowStorage.recordCloseQuality({ kind: 'falseDoIt', messageId: e.messageId, reason: 'undo' });
            }
            await renderLog();
          } else {
            // Same contract as the chip: the button stays Undo, and the
            // line under it says the record is still there.
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
