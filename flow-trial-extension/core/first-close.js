// First session: one safe close. After a source connects, the setup panel
// may offer exactly one Do It. It has to be a real task write that can be
// read back and undone. A draft, a send, a file lookup, a second step, a
// low score, or a hedge is not this offer. No chrome.*, no DOM, no network.
// The panel writes; this file only chooses.
const FlowFirstClose = (() => {
  // The product bar: the offer is on screen inside a minute of connecting,
  // so the remaining action is one click. A slower notice still counts on
  // a first session — withholding a real task because the scan was late
  // would leave the loop open — and withinWindow records which side it was.
  const WINDOW_MS = 60000;
  const GOOGLE_TASK = { googleTask: true, googleTasks: true };
  const OUTLOOK_TASK = { outlookTask: true, microsoftTodo: true };

  function priorCloses(closes) {
    if (!closes || typeof closes !== 'object') return 0;
    const total = closes.total;
    return typeof total === 'number' && total > 0 ? total : 0;
  }

  function safeStep(entry, source) {
    const steps = entry && entry.process && entry.process.steps;
    if (!Array.isArray(steps) || steps.length !== 1) return null;
    const step = steps[0];
    if (!step || step.added === true) return null;
    const params = step.params || {};
    if (params.fileTerm) return null;
    const kind = step.kind;
    if (source === 'google' && GOOGLE_TASK[kind]) return step;
    if (source === 'outlook' && OUTLOOK_TASK[kind]) return step;
    return null;
  }

  function confident(entry) {
    return Boolean(entry && entry.intent && entry.intent.confidence === 'high');
  }

  // Ranked still-open rows in, at most one offer out. Silence is the
  // result whenever the bar is missed: nothing connected, a close already
  // on the books, or no single safe task.
  function pick(input) {
    const opts = input && typeof input === 'object' ? input : {};
    if (opts.sourceConnected !== true) return null;
    if (opts.source !== 'google' && opts.source !== 'outlook') return null;
    const connectedAt = opts.connectedAt;
    if (typeof connectedAt !== 'number' || !(connectedAt > 0)) return null;
    if (priorCloses(opts.closes) > 0) return null;
    if (typeof FlowStillOpen === 'undefined' || typeof FlowStillOpen.select !== 'function') return null;
    const now = typeof opts.now === 'number' ? opts.now : Date.now();
    const ranked = FlowStillOpen.select(opts.candidates || [], now, opts.log || []);
    for (let i = 0; i < ranked.length; i++) {
      const entry = ranked[i];
      if (!entry || entry.verifying) continue;
      if (!confident(entry)) continue;
      const step = safeStep(entry, opts.source);
      if (!step) continue;
      const noticedAt = typeof entry.ts === 'number' && entry.ts > 0 ? entry.ts : now;
      const latencyMs = noticedAt - connectedAt;
      return {
        entry: entry,
        step: step,
        latencyMs: latencyMs,
        withinWindow: latencyMs <= WINDOW_MS
      };
    }
    return null;
  }

  // Panel chrome for the one offer. The popup is Hebrew by default, so the
  // card follows the UI language the host passes in; any other value reads
  // as English. The mail's own sentence (the why line) is built elsewhere.
  const COPY = {
    en: {
      title: 'One close',
      offerHint: 'One click. Read back before it counts. Undo removes it. Nothing is sent.',
      handledHint: 'Undo removes the task.',
      doIt: 'Do It',
      closing: 'Closing…',
      handled: 'Handled.',
      handledLine: 'Logged and tracked.',
      undo: 'Undo',
      undone: 'Undone.',
      undoneLine: 'The task is no longer on your list.',
      undoFailed: 'Undo did not finish. The task is still there.',
      notConfirmed: 'This stays open. The task was not confirmed.'
    },
    he: {
      title: 'סגירה אחת',
      offerHint: 'לחיצה אחת. נקרא בחזרה לפני שזה נספר. ביטול מסיר. שום דבר לא נשלח.',
      handledHint: 'ביטול מסיר את המשימה.',
      doIt: 'בצע',
      closing: 'סוגר…',
      handled: 'טופל.',
      handledLine: 'נרשם ונעקב.',
      undo: 'בטל',
      undone: 'בוטל.',
      undoneLine: 'המשימה כבר לא ברשימה שלך.',
      undoFailed: 'הביטול לא הושלם. המשימה עדיין שם.',
      notConfirmed: 'זה נשאר פתוח. המשימה לא אומתה.'
    }
  };

  function copy(lang) {
    return lang === 'he' ? COPY.he : COPY.en;
  }

  return { WINDOW_MS: WINDOW_MS, pick: pick, safeStep: safeStep, copy: copy };
})();

if (typeof module !== 'undefined') module.exports = { FlowFirstClose };
