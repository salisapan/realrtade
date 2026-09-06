// The popup is the only configuration surface, and it is deliberately two
// questions long: where may Flow write, and what kind of work is this. There is
// no rule builder here and there never will be — that is the product boundary.

(async function popupInit() {
  let status = await send({ type: 'flow:connector-status' });
  let state = await FlowStorage.get();

  wireTabs();
  wireSave();
  renderConnectors();
  renderDomains();
  renderStatusPill();
  await renderLog();

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
    FLOW_CONNECTORS.forEach((c) => host.appendChild(connectorCard(c)));
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

  /* ------------------------------------------------------------- domains */

  function renderDomains() {
    const host = document.getElementById('domain-list');
    host.replaceChildren();
    FLOW_DOMAINS.forEach((d) => {
      const label = el('label', 'opt');
      const input = el('input');
      input.type = 'radio'; input.name = 'domain'; input.value = d.id;
      input.checked = state.domainId ? state.domainId === d.id : d.id === 'sales';
      const txt = el('span', 'txt');
      txt.appendChild(el('span', 'name', d.label));
      txt.appendChild(el('span', 'kind', d.entity));
      label.append(input, txt);
      host.appendChild(label);
    });
  }

  /* ---------------------------------------------------------------- save */

  function wireSave() {
    document.getElementById('save').addEventListener('click', async () => {
      const domain = document.querySelector('input[name="domain"]:checked');
      const connected = Object.keys(status || {}).filter((k) => status[k].connected);
      const note = document.getElementById('saved-note');
      if (!connected.length) {
        note.textContent = 'Connect a system above first — Flow has nowhere to write yet.';
        note.hidden = false;
        return;
      }
      await FlowStorage.set({
        onboarded: true,
        domainId: domain ? domain.value : 'sales',
        connectorId: connected.includes(state.connectorId) ? state.connectorId : connected[0]
      });
      state = await FlowStorage.get();
      note.textContent = 'Saved. Open an email in Gmail — Flow will stay quiet until one matters.';
      note.hidden = false;
    });
  }

  /* ----------------------------------------------------------------- log */

  function wireTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', async () => {
        document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
        document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab.dataset.tab));
        if (tab.dataset.tab === 'log') await renderLog();
      });
    });
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
  function renderWeekStat(s) {
    const wrap = document.getElementById('weekStat');
    const written = (s.log || []).filter((e) => e.kind === 'written');
    if (!written.length) { wrap.hidden = true; return; }
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek = written.filter((e) => e.ts >= weekAgo).length;
    document.getElementById('weekCount').textContent = thisWeek;
    document.getElementById('weekLabel').textContent = ' logged this week';
    document.getElementById('weekTotal').textContent = written.length + ' all-time';
    wrap.hidden = false;
  }

  // Earns its place after real usage rather than nagging on first open —
  // three real writes is evidence Flow is actually working for this person,
  // which is the only moment "tell a teammate" is credible instead of noise.
  // Dismissing it is permanent; it never reappears once the user has said no.
  function renderReferral(s) {
    const wrap = document.getElementById('referral');
    const written = (s.log || []).filter((e) => e.kind === 'written');
    if (s.referralDismissed || written.length < 3) { wrap.hidden = true; return; }
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
        await navigator.clipboard.writeText('https://theflow-ai.com/trial.html?ref=share');
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
