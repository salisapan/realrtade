// The steps list. One model for the card that is on screen today and for the
// later Mail.Send preview (Draft → Review → Approve & send). This file does
// not send, and it does not ask for Mail.Send. Handled still requires
// ProofOfClose fetchedBack. Portable: no chrome.*, no DOM, no network.
const FlowStepList = (() => {
  const STATE_CLASS = {
    queued: 'is-pending',
    preparing: 'is-active',
    verifying: 'st-verifying',
    verified: 'is-done',
    failed: 'st-failed'
  };
  const STATE_LABEL = {
    queued: 'Queued',
    preparing: 'Preparing',
    verifying: 'Verifying',
    verified: 'Verified',
    failed: "Couldn't confirm · Retry"
  };

  function copyText(copy, lang) {
    if (copy == null) return '';
    if (typeof copy === 'string') return copy;
    if (lang === 'he') return copy.he || copy.en || '';
    return copy.en || copy.he || '';
  }

  function memoryStats(memory, processId, kind) {
    if (!memory) return null;
    const bucket = processId && memory[processId] ? memory[processId] : memory;
    const steps = bucket && bucket.steps;
    return steps ? steps[kind] : null;
  }

  function rejected(memory, processId, kind) {
    if (typeof FlowActions === 'undefined' || typeof FlowActions.isNetRejected !== 'function') return false;
    return FlowActions.isNetRejected(memoryStats(memory, processId, kind));
  }

  function rowsFromProcess(process, memory) {
    const steps = (process && process.steps) || [];
    const id = process && process.id;
    return steps.map((step, i) => {
      const kind = step && step.kind;
      const anchor = i === 0;
      const off = !anchor && rejected(memory, id, kind);
      return {
        id: (step && step.id) || (kind + ':' + i),
        kind: kind,
        copy: (step && (step.label || step.kind)) || '',
        state: 'queued',
        checked: anchor || !off,
        suggested: false,
        manual: false,
        optional: false,
        added: false,
        counted: true,
        role: anchor ? 'anchor' : 'step',
        step: step
      };
    });
  }

  function dormantRows(process, memory) {
    if (!process || typeof FlowActions === 'undefined' || !FlowActions.PROCESS_CATALOG) return [];
    const cat = FlowActions.PROCESS_CATALOG[process.id];
    if (!cat || !cat.stepKinds) return [];
    const present = {};
    (process.steps || []).forEach((s) => { if (s && s.kind) present[s.kind] = 1; });
    const out = [];
    cat.stepKinds.forEach((kind) => {
      if (present[kind]) return;
      if (!rejected(memory, process.id, kind)) return;
      out.push({
        id: 'dormant:' + kind,
        kind: kind,
        copy: kind,
        state: 'queued',
        checked: false,
        suggested: false,
        manual: false,
        optional: true,
        added: false,
        counted: false,
        role: 'dormant',
        step: null
      });
    });
    return out;
  }

  function rowFromAttachmentStep(step, lang) {
    const text = copyText(step && step.copy, lang);
    return {
      id: 'attachmentSave',
      kind: 'attachmentSave',
      copy: text,
      rawCopy: step && step.copy,
      state: 'queued',
      checked: true,
      suggested: true,
      manual: false,
      optional: false,
      added: false,
      counted: true,
      role: 'suggested',
      step: step || null
    };
  }

  function rowsFor(process, opts) {
    const o = opts || {};
    const base = rowsFromProcess(process, o.memory).map((row) => {
      if (row.kind === 'attachmentSave' && row.step) {
        const named = rowFromAttachmentStep(row.step, o.lang);
        return Object.assign({}, row, {
          copy: named.copy || row.copy,
          rawCopy: named.rawCopy,
          suggested: true,
          checked: true,
          role: 'suggested'
        });
      }
      if (row.step && row.step.added) {
        return Object.assign({}, row, { added: true, suggested: false, role: 'added', tag: 'Added' });
      }
      if (row.step) return Object.assign({}, row, { tag: 'Suggested' });
      return row;
    });
    return base.concat(dormantRows(process, o.memory));
  }

  function resolveAdded(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    if (/^(?:remind(?:\s+me)?(?:\s+to)?|call|follow up(?:\s+with)?|task)\b\s+\S+/i.test(t)) {
      return { kind: 'task', tag: 'Added', manual: false, counted: true, checked: true, copy: t, role: 'added', added: true };
    }
    if (/^(?:reply|draft|answer)\b\s+\S+/i.test(t)) {
      return { kind: 'draft', tag: 'Added', manual: false, counted: true, checked: true, copy: t, role: 'added', added: true };
    }
    if (/^(?:meet|schedule|calendar|hold)\b\s+\S+/i.test(t)) {
      return { kind: 'calendar', tag: 'Added', manual: false, counted: true, checked: true, copy: t, role: 'added', added: true };
    }
    if (/^(?:save|file)\b\s+\S+/i.test(t)) {
      return { kind: 'save', tag: 'Added', manual: false, counted: true, checked: true, copy: t, role: 'added', added: true };
    }
    return { kind: 'manual', tag: 'Manual', manual: true, counted: false, checked: false, copy: t, role: 'manual', added: false };
  }

  function addedRow(text) {
    const resolved = resolveAdded(text);
    if (!resolved) return null;
    return Object.assign({
      id: 'added:' + resolved.copy.slice(0, 40),
      state: 'queued',
      suggested: false,
      optional: false,
      step: null
    }, resolved);
  }

  function stepFromAdded(row, surface) {
    if (!row || row.manual) return null;
    const outlook = surface === 'outlook';
    if (row.kind === 'task') {
      return { kind: outlook ? 'outlookTask' : 'googleTask', id: row.id, label: row.copy, params: { title: row.copy }, added: true };
    }
    if (row.kind === 'draft') {
      return { kind: outlook ? 'outlookDraft' : 'gmailDraft', id: row.id, label: row.copy, params: { what: row.copy }, added: true };
    }
    if (row.kind === 'calendar') {
      return { kind: outlook ? 'outlookCalendar' : 'calendar', id: row.id, label: row.copy, params: {}, added: true };
    }
    if (row.kind === 'save') {
      return { kind: 'attachmentSave', id: row.id, label: row.copy, params: { files: [] }, added: true };
    }
    return null;
  }

  function liveStepsFrom(rows, surface) {
    const out = [];
    (rows || []).forEach((row) => {
      if (!row || !row.checked || row.manual || row.role === 'close') return;
      if (row.step) { out.push(row.step); return; }
      const built = stepFromAdded(row, surface);
      if (built) out.push(built);
    });
    return out;
  }

  function count(rows) {
    return (rows || []).filter((r) => r && r.checked && !r.manual && r.counted !== false && r.role !== 'close').length;
  }

  function manualCount(rows) {
    return (rows || []).filter((r) => r && r.manual).length;
  }

  function nextState(state, event) {
    const ev = event || '';
    if (ev === 'retry') return state === 'failed' ? 'preparing' : state;
    if (ev === 'start') return (state === 'queued' || state === 'failed') ? 'preparing' : state;
    if (ev === 'wrote') return state === 'preparing' ? 'verifying' : state;
    if (ev === 'fetched') return (state === 'verifying' || state === 'preparing') ? 'verified' : state;
    if (ev === 'miss') return state === 'verified' ? 'verified' : 'failed';
    return state || 'queued';
  }

  function applyEvent(rows, event) {
    return (rows || []).map((row) => {
      if (!row || row.manual || row.role === 'close' || row.checked === false) return row;
      return Object.assign({}, row, { state: nextState(row.state, event) });
    });
  }

  // fetchedBack is the gate. A failed required step stays open. A suggested
  // step and a manual step do not block a proved close.
  function handledAllowed(rows, proof) {
    if (!proof || proof.fetchedBack !== true) return false;
    const blocked = (rows || []).some((r) => r && r.checked && !r.suggested && !r.manual && !r.optional && r.role !== 'close' && r.state === 'failed');
    return !blocked;
  }

  // Preview only. The next stream renders this list. Nothing here sends.
  function mailSendPreview() {
    return [
      { kind: 'draft', copy: 'Draft', state: 'queued', role: 'preview', checked: true, counted: true },
      { kind: 'review', copy: 'Review', state: 'queued', role: 'preview', checked: true, counted: true },
      { kind: 'approveSend', copy: 'Approve & send', state: 'queued', role: 'close', locked: true, counted: false, checked: false, tag: 'after Approve' }
    ];
  }

  return {
    STATE_CLASS: STATE_CLASS,
    STATE_LABEL: STATE_LABEL,
    copyText: copyText,
    rowsFromProcess: rowsFromProcess,
    dormantRows: dormantRows,
    rowFromAttachmentStep: rowFromAttachmentStep,
    rowsFor: rowsFor,
    resolveAdded: resolveAdded,
    addedRow: addedRow,
    stepFromAdded: stepFromAdded,
    liveStepsFrom: liveStepsFrom,
    count: count,
    manualCount: manualCount,
    nextState: nextState,
    applyEvent: applyEvent,
    handledAllowed: handledAllowed,
    mailSendPreview: mailSendPreview
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { FlowStepList: FlowStepList };
if (typeof globalThis !== 'undefined') globalThis.FlowStepList = FlowStepList;
