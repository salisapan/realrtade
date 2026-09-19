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

  wireTabs();
  wireSave();
  wireRecipe();
  renderConnectors();
  renderStatusPill();
  await renderLog();
  await renderOpen();

  function send(msg) {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  async function refresh() {
    status = await send({ type: 'flow:connector-status' });
    state = await FlowStorage.get();
    renderConnectors();
    renderStatusPill();
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
    else if (c.status === 'live') head.appendChild(el('span', 'badge live', 'Works now'));
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
    const btn = el('button', (ready ? 'primary sm' : 'ghost wide'), 'Connect ' + c.label);
    btn.type = 'button';
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Connecting…'; err.hidden = true;
      const msg = { type: 'flow:connect', connectorId: c.id };
      Object.keys(inputs).forEach((k) => { msg[k] = inputs[k].value; });
      const res = await send(msg);
      if (res && res.ok) {
        await FlowStorage.set({ connectorId: c.id });
        chrome.runtime.sendMessage({ type: 'flow:track', event: 'connector_configured', params: { connector: c.id } });
        await refresh();
      } else {
        btn.disabled = false; btn.textContent = 'Connect ' + c.label;
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
  // A recipe is a shareable "how someone else set Glance up" — literally just
  // the two picks on this screen. It never carries a token, a log entry, or
  // anything Glance wrote, so passing a .glance file around is as safe as
  // describing your setup in a Slack message.

  function noteRecipe(text, ok) {
    const note = document.getElementById('recipeNote');
    note.textContent = text;
    note.style.color = ok ? 'var(--ok)' : 'var(--err)';
    note.hidden = false;
  }

  function wireRecipe() {
    document.getElementById('recipeExport').addEventListener('click', () => {
      const domain = FLOW_DOMAINS.find((d) => d.id === state.domainId) || FLOW_DOMAINS.find((d) => d.id === 'sales');
      const connector = FLOW_CONNECTORS.find((c) => c.id === state.connectorId);
      const recipe = {
        flowRecipe: 1,
        domainId: domain.id,
        domainLabel: domain.label,
        connectorId: connector ? connector.id : null,
        connectorLabel: connector ? connector.label : null
      };
      const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'glance-recipe-' + domain.id + (connector ? '-' + connector.id : '') + '.glance';
      a.click();
      URL.revokeObjectURL(url);
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
      // trust or store anything else a file could contain.
      const validDomain = FLOW_DOMAINS.find((d) => d.id === parsed.domainId);
      if (!validDomain) {
        noteRecipe('That file isn’t a valid Glance recipe.', false);
        return;
      }
      await FlowStorage.set({ domainId: validDomain.id });
      state = await FlowStorage.get();
      renderDomains();
      const wantedConnector = FLOW_CONNECTORS.find((c) => c.id === parsed.connectorId);
      const alreadyConnected = wantedConnector && status && status[wantedConnector.id] && status[wantedConnector.id].connected;
      if (wantedConnector && !alreadyConnected) {
        noteRecipe('Loaded — ' + validDomain.label + '. Connect ' + wantedConnector.label + ' above to match it exactly, or use whatever you already have.', true);
      } else {
        noteRecipe('Loaded — ' + validDomain.label + '. Click Save & start to apply it.', true);
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
  // The Unified Open Items Surface: every process Glance has proposed and
  // gotten no decision on yet, from FlowStorage.getPending() — the exact
  // same source of truth the in-Gmail indicator/panel and the extension-icon
  // badge already read. This is deliberately the one place that list is
  // visible independent of which thread (today) or app (Calendar/Drive,
  // later — see 'app' on each entry) it came from.
  //
  // Do It is intentionally NOT offered here. content-gmail.js's own onDoIt/
  // buildActionPayload needs a live Gmail tab for at least one real path
  // (fetching an attachment's bytes with the page's own cookies — see its
  // own comment on why that fetch can't happen anywhere else), and this
  // product's own rule about a duplicate write being the one failure it
  // can't absorb means a second, partially-DOM-independent copy of that
  // ~150-line orchestration living here — drifting from the original the
  // day either one changes — is a worse outcome than routing "close this"
  // back through the message it was proposed for. View jumps there directly;
  // Dismiss (genuinely DOM-independent — see content-gmail.js's own
  // onDismiss) is safe to offer verbatim.

  function pendingRowSubtitle(entry) {
    const who = (entry.sender && entry.sender.name) || (entry.sender && entry.sender.email) || '';
    const what = entry.subject || (entry.intent && entry.intent.label) || '';
    return who && what ? who + ' — ' + what : (what || who);
  }

  function openRow(entry) {
    const item = el('div', 'log-item');
    const top = el('div', 'log-top');
    top.appendChild(el('span', 'log-label', entry.process.name));
    // 'app' only exists on entries logged after this was added — every
    // entry from before falls back to 'gmail', the only source that has
    // ever existed, rather than showing a blank tag.
    top.appendChild(el('span', 'log-kind', (entry.app || 'gmail').toUpperCase()));
    item.appendChild(top);

    const subtitle = pendingRowSubtitle(entry);
    if (subtitle) item.appendChild(el('span', 'log-where', subtitle));

    const acts = el('div', 'log-acts');
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

  async function renderOpen() {
    const pending = await FlowStorage.getPending();
    // Keeps the extension-icon badge honest even when the popup is the
    // first surface opened after a browser restart, before any Gmail tab
    // has had a chance to recompute it itself — see background.js's
    // updateBadge comment for why this file never trusts a cached number.
    chrome.runtime.sendMessage({ type: 'flow:pending-count', count: pending.length });

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

  // Human-readable nouns for a catalog step id — cosmetic copy only, kept
  // here rather than in actions.js since it's UI text, not decision data
  // (unlike PROCESS_CATALOG/isNetRejected, which popup.js reads from
  // actions.js precisely so this card can never disagree with what the live
  // chip is actually doing).
  const STEP_NOUNS = { calendar: 'the Calendar step', draft: 'the draft reply step', task: 'the Task step' };

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
  }
  wireReferral();

  async function renderLog() {
    const s = await FlowStorage.get();
    renderWeekStat(s);
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
    top.appendChild(el('span', 'log-kind ' + e.kind, e.kind));
    item.appendChild(top);

    if (e.where) item.appendChild(el('span', 'log-where', 'Written to ' + e.where));
    item.appendChild(el('span', 'when', when(e.ts)));

    if (e.kind === 'written' && (e.url || e.ref)) {
      const acts = el('div', 'log-acts');
      if (e.url) {
        const a = el('a', 'ghost sm', 'View');
        a.href = e.url; a.target = '_blank'; a.rel = 'noopener';
        acts.appendChild(a);
      }
      if (e.ref) {
        const u = el('button', 'ghost sm', 'Undo');
        u.type = 'button';
        u.addEventListener('click', async () => {
          u.textContent = 'Undoing…';
          const r = await send({ type: 'flow:undo-action', connectorId: e.connectorId, ref: e.ref });
          if (r && r.ok) {
            await FlowStorage.appendLog({ kind: 'undone', label: e.label, messageId: e.messageId });
            await renderLog();
          } else {
            u.textContent = 'Undo failed';
          }
        });
        acts.appendChild(u);
      }
      item.appendChild(acts);
    }
    return item;
  }
})();
