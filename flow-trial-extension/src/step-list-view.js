// The steps card. Markup, glyphs, and chip copy come from the step-states kit
// (src/step-kit.js). The model is core/step-list.js. This file only paints and
// listens inside the card.
const FlowStepListView = (() => {
  function stateClass(state) {
    const map = (typeof FlowStepList !== 'undefined' && FlowStepList.STATE_CLASS) || {};
    return map[state] || 'is-pending';
  }

  function stateLabel(state) {
    const map = (typeof FlowStepList !== 'undefined' && FlowStepList.STATE_LABEL) || {};
    return map[state] || 'Queued';
  }

  function toolOf(row, surface) {
    const kind = String((row && row.kind) || '');
    if (row && row.manual) return { tool: 'manual', app: '' };
    if (/calendar/i.test(kind)) return { tool: 'calendar', app: 'Calendar' };
    if (/draft|gmail/i.test(kind)) return { tool: surface === 'outlook' ? 'outlook' : 'gmail', app: surface === 'outlook' ? 'Outlook' : 'Gmail' };
    if (/onedrive|attachmentSave/i.test(kind)) return { tool: 'onedrive', app: 'OneDrive' };
    if (/drive|save/i.test(kind)) return { tool: surface === 'gmail' ? 'drive' : 'onedrive', app: surface === 'gmail' ? 'Drive' : 'OneDrive' };
    if (/task|todo/i.test(kind)) return { tool: 'todo', app: 'To Do' };
    return { tool: 'you', app: 'You' };
  }

  function skippedLine(file) {
    if (typeof FlowSuggestSave !== 'undefined' && typeof FlowSuggestSave.skippedLabel === 'function') {
      return FlowSuggestSave.skippedLabel(file);
    }
    const why = (file && (file.why || file.reason)) || 'not saved';
    const name = file && String(file.name || '').trim();
    const id = file && String(file.id == null ? '' : file.id);
    if (name && name !== id) return name + ' · skipped · ' + why;
    return 'File skipped · ' + why;
  }

  function oneFile(file, skipped) {
    const id = String(file.id == null ? '' : file.id);
    const rawName = String(file.name || '').trim();
    const why = file.why || file.reason || '';
    const unnamed = !rawName || rawName === id || rawName.indexOf('File skipped') === 0;
    const isSkipped = skipped === true || file.skipped === true || unnamed;
    let shown = file.label;
    if (!shown) {
      if (isSkipped) shown = skippedLine(file);
      else if (typeof FlowSuggestSave !== 'undefined' && FlowSuggestSave.fileLabel) shown = FlowSuggestSave.fileLabel(file) || rawName;
      else shown = rawName;
    }
    if (!shown || shown === id) shown = skippedLine(file);
    return {
      n: shown,
      name: isSkipped ? '' : rawName,
      id: file.id,
      size: file.size,
      why: why,
      on: !isSkipped && file.on !== false,
      skipped: isSkipped
    };
  }

  function filesOf(row) {
    const params = row && row.step && row.step.params;
    if (!params) return [];
    const catalog = Array.isArray(params.catalog) && params.catalog.length ? params.catalog : (params.files || []);
    const seen = {};
    const out = [];
    catalog.forEach(function (f) {
      if (!f) return;
      const id = String(f.id == null ? '' : f.id);
      if (id && seen[id]) return;
      if (id) seen[id] = 1;
      out.push(oneFile(f));
    });
    (Array.isArray(params.excluded) ? params.excluded : []).forEach(function (f) {
      if (!f) return;
      const id = String(f.id == null ? '' : f.id);
      if (id && seen[id]) return;
      if (id) seen[id] = 1;
      out.push(oneFile(f, true));
    });
    return out;
  }

  function fileOnly(rows) {
    const live = (rows || []).filter(function (r) { return r && !r.manual && r.role !== 'close'; });
    return live.length === 1 && live[0].kind === 'attachmentSave' && filesOf(live[0]).length <= 1;
  }

  function paintModel(row, surface) {
    const tool = toolOf(row, surface);
    if (row.manual || row.role === 'manual') {
      return { kind: 'manual', id: row.id, text: row.copy, tag: 'Manual · for you' };
    }
    if (row.role === 'close') {
      return { kind: 'close', id: row.id, text: row.copy, tag: row.tag || 'after Approve', st: row.state ? stateClass(row.state) : '' };
    }
    const files = filesOf(row);
    const failed = row.state === 'failed';
    const verified = row.state === 'verified';
    const base = {
      id: row.id,
      tool: tool.tool,
      app: tool.app,
      suggested: row.suggested === true,
      added: row.added === true,
      checked: row.checked !== false,
      tag: row.suggested ? 'Suggested' : (row.added ? 'Added' : (row.tag || '')),
      st: stateClass(row.state),
      kind: row.suggested ? 'suggested' : ''
    };
    base.text = row.copy || '';
    if (files.length > 1) {
      base.kind = 'multi';
      base.files = files;
      base.expanded = row.expanded === true;
      return base;
    }
    if (row.state === 'offline') {
      base.out = row.offlineLine || 'Outlook is not connected';
      return base;
    }
    if (failed) {
      base.out = 'Couldn’t confirm · <em class="ss-retry">Retry</em>';
      return base;
    }
    if (verified) {
      base.res = stateLabel('verified') + ' <i class="ss-ok" aria-label="verified">✓</i>';
      return base;
    }
    base.out = stateLabel(row.state || 'queued');
    return base;
  }

  function approveFor(rows) {
    const failed = (rows || []).filter(function (r) { return r && r.state === 'failed' && r.checked !== false; });
    if (!failed.length) return null;
    const required = failed.filter(function (r) { return !r.suggested && !r.manual && r.role !== 'close'; });
    if (required.length) {
      const n = required.length;
      return {
        disabled: true,
        title: n === 1 ? 'Still open · 1 step unconfirmed' : 'Still open · ' + n + ' steps unconfirmed',
        sub: 'Approve unlocks once it verifies'
      };
    }
    const verified = (rows || []).filter(function (r) { return r && r.state === 'verified'; }).length;
    const total = (rows || []).filter(function (r) { return r && !r.manual && r.role !== 'close'; }).length;
    const app = toolOf(failed[0], 'outlook').app || 'step';
    return {
      disabled: false,
      title: 'Still open · waiting for your approval',
      sub: 'Prepared ≠ closed · ' + verified + ' of ' + total + ' verified · ' + app + ' left out'
    };
  }

  function themeDark() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) { return false; }
  }

  function mount(host, rows, opts) {
    const o = opts || {};
    const Kit = (typeof FlowStepKit !== 'undefined') ? FlowStepKit : null;
    let list = (rows || []).slice();
    const only = fileOnly(list);
    if (!only) {
      list = list.map(function (r) {
        return (r && r.suggested) ? Object.assign({}, r, { checked: false }) : r;
      });
    }
    const root = document.createElement('div');
    root.className = 'flow-step-card flow-step-list';
    if (themeDark()) root.setAttribute('data-theme', 'dark');
    root.setAttribute('data-glance-states', 'queued');
    root.setAttribute('data-glance-state', 'queued');
    host.appendChild(root);

    function emit() {
      if (o.onChange) o.onChange(list.slice());
    }

    function cfg() {
      const surface = o.surface || 'outlook';
      const he = o.lang === 'he';
      const painted = list.map(function (r) { return paintModel(r, surface); });
      const multi = painted.some(function (r) { return r.kind === 'multi'; });
      let chip;
      if (only) {
        chip = { mode: 'ask', q: Kit ? Kit.esc(o.intent || 'Save the file?') : (o.intent || 'Save the file?'), noHold: true, icon: 'onedrive' };
      } else if (multi) {
        const target = surface === 'gmail' ? 'Drive' : 'OneDrive';
        chip = { mode: 'files', noHold: true, target: target };
      } else {
        chip = { mode: 'count' };
      }
      return {
        he: he,
        intent: o.intent || '',
        rows: painted,
        chip: chip,
        approve: approveFor(list),
        state: 'propose'
      };
    }

    function bind(stage, model) {
      stage.querySelectorAll('.act-check').forEach(function (box) {
        box.addEventListener('change', function () {
          const li = box.closest('li.act');
          const id = li && li.getAttribute('data-step-id');
          list = list.map(function (r) { return (r && r.id === id) ? Object.assign({}, r, { checked: box.checked }) : r; });
          if (model.chip.mode === 'count' || model.chip.mode === 'files') Kit.syncChip(stage, current());
          emit();
        });
      });
      const retry = stage.querySelector('.ss-retry');
      if (retry) {
        retry.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          const li = retry.closest('li.act');
          const id = li && li.getAttribute('data-step-id');
          list = list.map(function (r) { return (r && r.id === id) ? Object.assign({}, r, { state: 'preparing' }) : r; });
          draw();
          if (o.onRetry) o.onRetry(list.filter(function (r) { return r && r.id === id; })[0]);
        });
      }
      stage.querySelectorAll('.ss-pill').forEach(function (pill) {
        pill.addEventListener('click', function (e) {
          e.preventDefault();
          const li = pill.closest('li.act');
          const id = li && li.getAttribute('data-step-id');
          list = list.map(function (r) {
            if (!r || r.id !== id) return r;
            const files = filesOf(r).map(function (f) {
              return { id: f.id, name: f.name, size: f.size, why: f.why, on: f.on, skipped: f.skipped, label: f.skipped ? f.n : '' };
            });
            let expanded = r.expanded === true;
            if (pill.hasAttribute('data-more')) expanded = true;
            else if (pill.hasAttribute('data-less')) expanded = false;
            else {
              const idx = Number(pill.getAttribute('data-f'));
              if (files[idx] && !files[idx].skipped) files[idx].on = !files[idx].on;
            }
            const selected = files.filter(function (f) { return f.on && !f.skipped; });
            const step = r.step ? Object.assign({}, r.step, { params: Object.assign({}, r.step.params, { files: selected, catalog: files }) }) : r.step;
            return Object.assign({}, r, { expanded: expanded, checked: selected.length > 0, step: step });
          });
          draw();
          emit();
        });
      });
      const addBtn = stage.querySelector('.ss-add-btn');
      const add = stage.querySelector('.ss-add');
      const input = stage.querySelector('.ss-add-input');
      if (addBtn && add) {
        addBtn.addEventListener('click', function () {
          add.setAttribute('data-open', 'true');
          if (input) input.focus();
        });
      }
      if (input) {
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') {
            if (add) add.setAttribute('data-open', 'false');
            return;
          }
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const row = (typeof FlowStepList !== 'undefined' && FlowStepList.addedRow) ? FlowStepList.addedRow(input.value) : null;
          input.value = '';
          if (add) add.setAttribute('data-open', 'false');
          if (!row) return;
          const closeAt = list.findIndex(function (r) { return r && r.role === 'close'; });
          if (closeAt >= 0) list.splice(closeAt, 0, row);
          else list.push(row);
          draw();
          emit();
        });
      }
      const dismiss = stage.querySelector('.chip-x');
      if (dismiss) {
        dismiss.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (o.onDismiss) o.onDismiss();
        });
      }
      const hold = stage.querySelector('.chip-hold');
      if (hold) {
        hold.addEventListener('click', function (e) {
          e.preventDefault();
          root.setAttribute('data-glance-held', '1');
        });
      }
      const go = stage.querySelector('.do-halo');
      if (go) {
        go.addEventListener('click', function (e) {
          e.preventDefault();
          if (o.onDoIt) o.onDoIt(go);
        });
      }
      const approve = stage.querySelector('.approve-btn');
      if (approve) {
        approve.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          root.setAttribute('data-glance-approve', 'held');
          const failed = list.filter(function (r) { return r && r.state === 'failed' && r.checked !== false; })[0];
          if (!failed) return;
          if (approve.disabled) return;
          if (o.onRetry) o.onRetry(failed);
        });
      }
    }

    function current() { return cfg(); }

    function draw() {
      if (!Kit) return;
      const model = current();
      root.innerHTML = Kit.stageHTML(model);
      const stage = root.querySelector('.ss-stage');
      Kit.syncChip(stage, model);
      bind(stage, model);
    }

    function pushState(state) {
      const prev = (root.getAttribute('data-glance-states') || '').split(',').filter(Boolean);
      if (prev[prev.length - 1] !== state) prev.push(state);
      root.setAttribute('data-glance-states', prev.join(','));
      root.setAttribute('data-glance-state', state);
    }

    draw();
    emit();

    return {
      root: root,
      rows: function () { return list.slice(); },
      manualCount: function () { return list.filter(function (r) { return r && r.manual; }).length; },
      addSuggested: function (row) {
        if (!row || list.some(function (r) { return r && r.kind === 'attachmentSave'; })) return;
        const suggested = Object.assign({}, row, { suggested: true, checked: false, role: 'suggested' });
        const closeAt = list.findIndex(function (r) { return r && r.role === 'close'; });
        if (closeAt >= 0) list.splice(closeAt, 0, suggested);
        else list.push(suggested);
        draw();
        emit();
      },
      setAll: function (state, line) {
        list = list.map(function (row) {
          if (!row || row.manual || row.role === 'close' || row.checked === false) return row;
          const next = Object.assign({}, row, { state: state });
          if (line) next.offlineLine = line;
          return next;
        });
        pushState(state);
        draw();
      },
      setRow: function (id, state) {
        list = list.map(function (row) { return (row && row.id === id) ? Object.assign({}, row, { state: state }) : row; });
        pushState(state);
        draw();
      }
    };
  }

  return { mount: mount };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { FlowStepListView: FlowStepListView };
if (typeof globalThis !== 'undefined') globalThis.FlowStepListView = FlowStepListView;
