(async function popupInit() {
  const state = await FlowStorage.get();
  renderConnectors(state);
  renderDomains(state);
  wireTabs();
  wireSave();
  await renderLog();

  function renderConnectors(state) {
    const host = document.getElementById('connector-list');
    host.innerHTML = '';
    FLOW_CONNECTORS.forEach((c) => {
      const disabled = c.status === 'planned';
      const label = document.createElement('label');
      label.className = 'opt' + (disabled ? ' disabled' : '');

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = c.id;
      input.disabled = disabled;
      input.checked = state.connectorId === c.id;
      input.addEventListener('change', () => {
        // Single-connector selection for Phase 1 (radio-like checkbox group);
        // the data model already supports more than one, this just keeps the
        // UI honest about what's actually wired up.
        document.querySelectorAll('#connector-list input').forEach((i) => {
          if (i !== input) i.checked = false;
        });
      });

      const txt = document.createElement('span');
      txt.className = 'txt';
      txt.innerHTML = `<span class="name">${c.label}</span><span class="kind">${c.kind}${c.note ? ' · ' + c.note : ''}</span>`;

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = c.status === 'live' ? 'זמין' : c.status === 'building' ? 'בבנייה' : 'בהמשך';

      label.append(input, txt, badge);
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
      const connectorId = document.querySelector('#connector-list input:checked')?.value || null;
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
      const kindLabel = { shown: 'הוצע', clicked: 'בוצע', dismissed: 'נדחה' }[entry.kind] || entry.kind;
      item.innerHTML = `<span class="kind ${entry.kind}">${kindLabel}</span>${entry.label}<span class="when">${new Date(entry.ts).toLocaleString('he-IL')}</span>`;
      host.appendChild(item);
    });
  }
})();
