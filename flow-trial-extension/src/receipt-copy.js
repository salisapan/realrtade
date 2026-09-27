// The words on the chip after Do It succeeds. Pure data — no DOM, no
// chrome.* — so the receipt in content-gmail.js and the corpus below can
// share one definition of "handled" versus "partly handled" versus Undo.
//
// A full close says "Handled." A close where at least one step did not
// land says "Partly handled." and does not add the early-close line,
// which claims there is nothing left to check. The early-close sentence
// is an extra line under the status word for the first three full closes
// only (docs/magic-moment.md). It is not a substitute for the status word.

const FlowReceipt = (() => {
  const EARLY_CLOSE_LIMIT = 3;
  const EARLY_LINE = 'Nothing else to open, nothing else to check — that’s handled.';
  const STATUS_HANDLED = 'Handled.';
  const STATUS_PARTIAL = 'Partly handled.';

  function count(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return 0;
    return v;
  }

  // succeeded / total: how many steps in this Do It actually wrote.
  // priorCloses: writeStats.total from BEFORE those writes are logged.
  function confirmation(input) {
    input = input || {};
    const succeeded = count(input.succeeded);
    const total = count(input.total);
    const priorCloses = count(input.priorCloses);
    const full = succeeded > 0 && succeeded === total;
    return {
      full,
      status: succeeded === 0 ? null : (full ? STATUS_HANDLED : STATUS_PARTIAL),
      earlyLine: full && priorCloses < EARLY_CLOSE_LIMIT ? EARLY_LINE : null,
      undoLabel: succeeded > 1 ? 'Undo all' : 'Undo'
    };
  }

  return { confirmation, EARLY_CLOSE_LIMIT, EARLY_LINE, STATUS_HANDLED, STATUS_PARTIAL };
})();
