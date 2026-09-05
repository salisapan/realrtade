(async function popupInit() {
  const state = await FlowStorage.get();
  const hubspotStatus = await sendToBackground({ type: 'flow:hubspot-status' });
  renderConnectors(state, hubspotStatus?.connected);
  renderDomains(state);
  wireTabs();
  wireSave();
  await renderLog();

  function sendToBackground(msg) {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
  }

  function renderConnectors(state, hubspotConnected) {
    const host = document.getElementById('connector-list');
    host.innerHTML = '';
    FLOW_CONNECTORS.forEach((c) => {
      const disabled = c.status === 'planned';
      const label = document.createElement('label');
      label.className = 'opt' + (disabled ? ' disabled' : '');

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = c.id;
      input.disabled = disabled || Boolean(c.oauth); // OAuth connectors are driven by the Connect button, not the checkbox
      input.checked = state.connectorId === c.id;

      const txt = document.createElement('span');
      txt.className = 'txt';
      txt.innerHTML = `<span class="name">${c.label}</span><span class="kind">${c.kind}${c.note ? ' · ' + c.note : ''}</span>`;
      if (c.oauth) {
        const err = document.createElement('span');
        err.className = 'connect-err';
        err.hidden = true;
        txt.appendChild(err);
      }

      label.append(input, txt);

      if (c.oauth && c.status !== 'planned') {
        if (hubspotConnected) {
          const badge = document.createElement('span');
          badge.className = 'badge connected';
          badge.textContent = 'Connected';
          label.appendChild(badge);
          const disconnectBtn = document.createElement('button');
          disconnectBtn.type = 'button';
          disconnectBtn.className = 'connect-btn';
          disconnectBtn.textContent = 'Disconnect';
          disconnectBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await sendToBackground({ type: 'flow:disconnect-hubspot' });
            await FlowStorage.set({ connectorId: null, onboarded: false });
            renderConnectors(await FlowStorage.get(), false);
          });
          label.appendChild(disconnectBtn);
          input.checked = true;
        } else {
          const connectBtn = document.createElement('button');
          connectBtn.type = 'button';
          connectBtn.className = 'connect-btn';
          connectBtn.textContent = 'Connect';
          connectBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            connectBtn.textContent = 'Connecting…';
            connectBtn.disabled = true;
            const res = await sendToBackground({ type: 'flow:connect-hubspot' });
            if (res?.ok) {
              await FlowStorage.set({ connectorId: c.id });
              renderConnectors(await FlowStorage.get(), true);
            } else {
              connectBtn.textContent = 'Connect';
              connectBtn.disabled = false;
              const errEl = label.querySelector('.connect-err');
              if (errEl) {
                errEl.textContent = res?.error || 'Connection failed.';
                errEl.hidden = false;
              }
            }
          });
          label.appendChild(connectBtn);
        }
      } else {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = c.status === 'live' ? 'Live' : c.status === 'building' ? 'Building' : 'Planned';
        label.appendChild(badge);
        input.addEventListener('change', () => {
          document.querySelectorAll('#connector-list input').forEach((i) => {
            if (i !== input) i.checked = false;
          });
        });
      }

      host.appendChild(label);
    });
  }

  function renderDomains(state) {
    const host = document.getElementById('domain-list');
    host.innerHTML = '';
    FLOW_DOMAINS.forEach((d) => {
      const label = document.createElement('label');
      label.className = 'opt';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'domain';
      input.value = d.id;
      input.checked = state.domainId === d.id;

      const txt = document.createElement('span');
      txt.className = 'txt';
      txt.innerHTML = `<span class="name">${d.label}</span><span class="kind">${d.entity}</span>`;

      label.append(input, txt);
      host.appendChild(label);
    });
  }

  function wireTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
        document.querySelectorAll('.panel').forEach((p) => {
          p.classList.toggle('active', p.dataset.panel === tab.dataset.tab);
        });
      });
    });
  }

  function wireSave() {
    document.getElementById('save').addEventListener('click', async () => {
      const checkedBox = document.querySelector('#connector-list input:checked');
      const connectorId = checkedBox ? checkedBox.value : (await FlowStorage.get()).connectorId;
      const domainId = document.querySelector('#domain-list input:checked')?.value || null;
      await FlowStorage.set({ connectorId, domainId, onboarded: Boolean(connectorId && domainId) });
      const note = document.getElementById('saved-note');
      note.hidden = false;
      setTimeout(() => { note.hidden = true; }, 2400);
    });
  }

  async function renderLog() {
    const s = await FlowStorage.get();
    const host = document.getElementById('log-list');
    const empty = document.getElementById('log-empty');
    host.innerHTML = '';
    if (!s.log.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    s.log.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'log-item';
      const kindLabel = { shown: 'Shown', clicked: 'Done', dismissed: 'Dismissed' }[entry.kind] || entry.kind;
      item.innerHTML = `<span class="kind ${entry.kind}">${kindLabel}</span>${entry.label}<span class="when">${new Date(entry.ts).toLocaleString('en-US')}</span>`;
      host.appendChild(item);
    });
  }
})();
