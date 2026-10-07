// The words on the chip after Do It succeeds. Pure data — no DOM, no
// chrome.* — so the receipt in content-gmail.js and the corpus below can
// share one definition of "handled" versus "partly handled" versus Undo.
//
// A full close says "Handled." A close where at least one step did not
// land says "Partly handled." and does not add the early-close line,
// which claims there is nothing left to check. The early-close sentence
// is an extra line under the status word for the first three full closes
// only (docs/magic-moment.md). It is not a substitute for the status word.
//
// Undo has to be obvious on that same receipt. The button stays "Undo"
// (or "Undo all"); the sentence under it names the record it removes.
// A reverse that did not finish says what is still there, and never
// "some of this" when nothing moved.

const FlowReceipt = (() => {
  const EARLY_CLOSE_LIMIT = 3;
  const EARLY_LINE = 'Nothing else to open, nothing else to check — that’s handled.';
  const STATUS_HANDLED = 'Handled.';
  const STATUS_HANDLED_HE = 'טופל.';
  const STATUS_PARTIAL = 'Partly handled.';
  // response.where values the Google writers actually return. Anything
  // else stays unnamed — a generic sentence is honest, a dropped
  // destination is not.
  const PLACE_NOUN = {
    'Google Tasks': 'Google Task',
    'Gmail': 'Gmail draft',
    'Google Calendar': 'Calendar event',
    'Google Docs': 'Doc',
    'Google Sheets': 'Sheet',
    'Google Drive': 'Drive file'
  };

  function count(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return 0;
    return v;
  }

  // succeeded / total: how many steps in this Do It actually wrote.
  // priorCloses: writeStats.total from BEFORE those writes are logged.
  // requireProof: this Do It includes a writer that must be read back
  // (Google Tasks in this slice). Handled only when every proof has
  // fetchedBack true. Omit requireProof for writers that are not on
  // this gate yet (Calendar, drafts, Drive).
  function confirmation(input) {
    input = input || {};
    const succeeded = count(input.succeeded);
    const total = count(input.total);
    const priorCloses = count(input.priorCloses);
    const handled = input.lang === 'he' ? STATUS_HANDLED_HE : STATUS_HANDLED;
    if (input.requireProof) {
      const proofs = Array.isArray(input.proofs) ? input.proofs : [];
      const gate = typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null;
      const proved = !!(gate && proofs.length > 0 && proofs.every((p) => gate.isProof(p)));
      if (!proved) {
        const partial = succeeded > 0 && total > succeeded;
        return {
          full: false,
          status: partial ? STATUS_PARTIAL : null,
          earlyLine: null,
          undoLabel: succeeded > 1 ? 'Undo all' : 'Undo',
          verifyStatus: input.verifyStatus || (proofs.length ? 'verify_failed' : 'proof_pending')
        };
      }
    }
    const full = succeeded > 0 && succeeded === total;
    return {
      full,
      status: succeeded === 0 ? null : (full ? handled : STATUS_PARTIAL),
      earlyLine: full && priorCloses < EARLY_CLOSE_LIMIT ? EARLY_LINE : null,
      undoLabel: succeeded > 1 ? 'Undo all' : 'Undo'
    };
  }

  function cleanWheres(wheres) {
    if (!Array.isArray(wheres)) return [];
    const out = [];
    for (const w of wheres) {
      if (typeof w !== 'string') continue;
      const trimmed = w.trim();
      if (trimmed) out.push(trimmed);
    }
    return out;
  }

  // null means at least one destination is not in PLACE_NOUN, so the
  // caller must not list only the ones it recognizes.
  function nounsFor(wheres) {
    const list = cleanWheres(wheres);
    const nouns = [];
    for (const w of list) {
      const noun = PLACE_NOUN[w];
      if (!noun) return null;
      if (nouns.indexOf(noun) === -1) nouns.push(noun);
    }
    return nouns;
  }

  function joinWithAnd(items) {
    if (items.length <= 1) return items[0] || '';
    if (items.length === 2) return items[0] + ' and ' + items[1];
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  // wheres: response.where from each write that actually landed, in the
  // order they landed.
  function undoHint(wheres) {
    const list = cleanWheres(wheres);
    const nouns = nounsFor(list);
    if (!nouns || !nouns.length) {
      return list.length > 1
        ? 'Undo all removes what was just written.'
        : 'Undo removes what was just written.';
    }
    if (nouns.length === 1) return 'Undo removes the ' + nouns[0] + '.';
    return 'Undo all removes ' + joinWithAnd(nouns.map((n) => 'the ' + n)) + '.';
  }

  function undoneLine(wheres) {
    const nouns = nounsFor(wheres);
    if (!nouns || !nouns.length) return 'Undone — nothing was kept.';
    if (nouns.length === 1) return 'Undone — the ' + nouns[0] + ' was removed.';
    return 'Undone — ' + joinWithAnd(nouns.map((n) => 'the ' + n)) + ' were removed.';
  }

  // reversed: how many writes in this attempt actually reverted.
  // remaining: how many of the original writes are still there.
  // keptWhere: response.where of the write this attempt could not revert.
  // One remaining record is named. Several remaining records are not
  // collapsed into the one that happened to fail first.
  function reverseNote(input) {
    input = input || {};
    const reversed = count(input.reversed);
    const remaining = count(input.remaining);
    const kept = typeof input.keptWhere === 'string' ? PLACE_NOUN[input.keptWhere.trim()] : null;
    if (reversed === 0) {
      if (remaining === 1 && kept) return 'Still there — the ' + kept + ' was not removed.';
      if (remaining === 1) return 'Still there — Undo didn’t remove it.';
      return 'Still there — nothing was removed.';
    }
    if (remaining === 1 && kept) return 'The ' + kept + ' is still there. Undo again to remove it.';
    return 'Not all of it is gone. Undo again to remove what’s left.';
  }

  return {
    confirmation, undoHint, undoneLine, reverseNote,
    EARLY_CLOSE_LIMIT, EARLY_LINE, STATUS_HANDLED, STATUS_HANDLED_HE, STATUS_PARTIAL
  };
})();
