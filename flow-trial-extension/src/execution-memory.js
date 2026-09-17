// Execution Memory: the simplest possible local record of what a user
// actually does with a proposed process, kept per process id (not per
// message — "Schedule & Confirm" is one thing to have an opinion about,
// regardless of which email triggered it this time).
//
// This exists for one purpose: "You intend — we execute" only holds if the
// system gets better at guessing your intent the more it watches you close
// (or not close) the same kind of process. A step this account has
// repeatedly stripped off before confirming, or accepted and then undone,
// is a real preference — not proposing it again next time is the system
// acting on what it already learned, not a "smarter suggestion algorithm."
//
// Everything here is local-only (chrome.storage.local), the same as every
// other piece of state this extension keeps. Nothing about what a user
// accepts, removes, or undoes is ever sent anywhere.

const FlowExecutionMemory = (() => {
  const STORAGE_KEY = 'flowExecutionMemory';

  // A process's memory is small and bounded by construction — at most a
  // handful of step kinds, three counters each — so there is no cap to
  // enforce the way FlowStorage's log needs one; this never grows with the
  // number of messages seen, only with the number of distinct processes
  // (currently four).

  async function getAll() {
    try {
      const { [STORAGE_KEY]: mem } = await chrome.storage.local.get(STORAGE_KEY);
      return mem || {};
    } catch (e) {
      return {};
    }
  }

  function blankProcess() {
    return { closedCount: 0, undoneCount: 0, steps: {} };
  }

  function blankStep() {
    return { accepted: 0, removed: 0, undone: 0 };
  }

  async function mutate(processId, fn) {
    if (!processId) return;
    try {
      const mem = await getAll();
      const proc = mem[processId] || blankProcess();
      fn(proc);
      mem[processId] = proc;
      await chrome.storage.local.set({ [STORAGE_KEY]: mem });
    } catch (e) {
      // Never let memory bookkeeping be the reason a real write fails or a
      // dismiss doesn't register — this is a bias signal for next time, not
      // something this click depends on.
    }
  }

  // Called once per Do It click: which step kinds survived into the actual
  // write (acceptedKinds) and which were stripped off first with the ×
  // (removedKinds) — both by kind, not by individual step, since the bias
  // this feeds is "does this account want a Draft step in this process,"
  // not "did this exact draft get removed."
  function recordDoIt(processId, acceptedKinds, removedKinds) {
    return mutate(processId, (proc) => {
      proc.closedCount++;
      for (const k of acceptedKinds) {
        proc.steps[k] = proc.steps[k] || blankStep();
        proc.steps[k].accepted++;
      }
      for (const k of removedKinds) {
        proc.steps[k] = proc.steps[k] || blankStep();
        proc.steps[k].removed++;
      }
    });
  }

  // Dismissing the whole chip is the same signal as removing every one of
  // its steps — the user looked at the full process and wanted none of it.
  function recordDismiss(processId, allKinds) {
    return mutate(processId, (proc) => {
      for (const k of allKinds) {
        proc.steps[k] = proc.steps[k] || blankStep();
        proc.steps[k].removed++;
      }
    });
  }

  // Accepted, then undone — a stronger "don't propose this" signal than a
  // pre-execution removal, since the user only found out they didn't want
  // it after seeing it actually happen.
  function recordUndo(processId, undoneKinds) {
    return mutate(processId, (proc) => {
      proc.undoneCount++;
      for (const k of undoneKinds) {
        proc.steps[k] = proc.steps[k] || blankStep();
        proc.steps[k].undone++;
      }
    });
  }

  return { getAll, recordDoIt, recordDismiss, recordUndo };
})();

if (typeof module !== 'undefined') module.exports = { FlowExecutionMemory };
