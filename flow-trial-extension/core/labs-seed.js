// The waves of Labs closes that start ON in an unpacked (non-store) install. Portable: no chrome.*, no DOM. Owner, 2026-11-16: «תדליק».
//
// Glance's lock is that every integrated close is on after one consent and that nothing the person did not choose is hidden. The Labs rows ship off until a live Gate; this list is the
// wave the owner turned on: a mail that asks for something with a day becomes a task (TASK_ASK), a payment asked of the person becomes the task «Pay X» and nothing is paid
// (PAYMENT_ASK), a booking told to the person becomes a hold (BOOKING_NOTICE), and a system notice with a deadline becomes a task (SYSTEM_NOTICE). Every one of them writes through a writer that
// reads the object back by id and has an Undo that leaves an edited one alone. A Chrome Web Store install never seeds (Labs is locked there, src/background.js glanceSwitchOn).
//
// NOT in the wave, on purpose: CALENDAR_CHANGE (a delete or an update of an existing calendar event: today's writer reports without a read-back, so it stays off until the proven
// path, core/calendar-move.js and the calendar-cancel writer in #283, is wired), DECOMPOSE (no real multi-intent set exists), and every switch whose close has no held-out set.
//
// The seed is written once per version into the same storage object the popup edits (glanceSwitches). A row the person turns off is deleted from it, and the version marker stops it from
// being seeded again, so the person's choice always wins. Raising SEED_VERSION adds only the rows the new version lists and only where the key is missing.
const FlowLabsSeed = (() => {
  const SEED_VERSION = 2;
  // Wave 1 (owner, 2026-11-16 «תדליק»): the four task and hold closes. Wave 2 (owner, 2026-11-16 «יש לך אישור להכול»): the closes that create a new empty file or a video link, each through a writer
  // that reads the object back and has an Undo: an empty Google Doc, Sheet or Slides file and a Sheet row (WORKSPACE_FILE), a Google Meet link on a proposed call (MEET_LINK), a Teams link on a proposed call
  // in Outlook (TEAMS_MEETING), an empty Word or Excel file (ONEDRIVE_NEW_FILE). Evidence before it went on: every Labs switch off reads 28 of 89 and 23 of 70 on the held-out kind sets, waves 1 and 2 read
  // exactly what every switch on reads (67 of 89 and 54 of 70), 0 wrong Do It and every contrast row silent on both sets, 0 wrong slot on 36 offered rows of the slot gold.
  const WAVES = { 1: ['TASK_ASK', 'PAYMENT_ASK', 'BOOKING_NOTICE', 'SYSTEM_NOTICE'], 2: ['WORKSPACE_FILE', 'MEET_LINK', 'TEAMS_MEETING', 'ONEDRIVE_NEW_FILE'] };
  const DEFAULT_ON = [].concat(WAVES[1], WAVES[2]);
  // seed(bag, seededVersion) -> { bag, version, changed }. Pure: the caller stores the result. A wave is added only to an install that has not seen it, and only where the key is missing.
  function seed(bag, seededVersion) {
    const have = Number.isInteger(seededVersion) ? seededVersion : 0;
    const base = Object.assign({}, bag || {});
    if (have >= SEED_VERSION) return { bag: base, version: have, changed: false };
    let changed = false;
    Object.keys(WAVES).map(Number).filter((v) => v > have).forEach((v) => WAVES[v].forEach((id) => { if (!Object.prototype.hasOwnProperty.call(base, id)) { base[id] = true; changed = true; } }));
    return { bag: base, version: SEED_VERSION, changed: changed || have !== SEED_VERSION };
  }
  return { SEED_VERSION, WAVES, DEFAULT_ON, seed };
})();
if (typeof module !== 'undefined') module.exports = { FlowLabsSeed };
else if (typeof globalThis !== 'undefined') globalThis.FlowLabsSeed = FlowLabsSeed;
