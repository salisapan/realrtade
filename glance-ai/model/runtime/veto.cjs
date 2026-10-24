'use strict';
// Hard-veto layer. The model may only ever pick SILENT or ONE action; any veto forces SILENT. Vetoes can only remove a card,
// never add one (silence beats a wrong Do It; never widen show in ways that weaken silence).
//  base  = the 0.9.34 engine's own silence decisions that are rules, not uncertainty (family/quiet gates, own mail,
//          capability gates, chains that own the case). 'intent-null' / 'chip-low-confidence' are NOT vetoes: that is the
//          region where the model is allowed to have an opinion (and where shadow measures it).
//  cap   = surface capability: a save needs exactly one attachment; Outlook has no bare calendar writer here.
//  v2    = PROPOSED rules (not in 0.9.34) that fix bugs found 2026-10-07; silence-only.
const BASE = new Set(['own-sender', 'note-to-self', 'quiet:noise', 'quiet:hedge', 'quiet:google', 'quiet:family', 'third-party', 'file',
  'file-chain-not-run', 'fact-reply-block', 'no-draft-close', 'too-short', 'google-wait(drive-lookup)', 'calendar-wait(file-lookup)']);
function baseVeto(teacher) {
  if (teacher.show) return null;
  const r = teacher.reason || '';
  if (BASE.has(r) || r.startsWith('calendar-')) return r;
  return null;
}
const V2 = [
  ['negation', /(\b(?:don'?t|do not|no need to|never|not to|there is no need to|you don'?t need to)\b[^.!?\n]{0,30}\b(?:save|upload|store|file|send|forward|schedule|book|pay|wire|transfer|add|create|share)\b)|(?:^|\s)(?:אל\s+ת[\u05D0-\u05EA]+|אין צורך ל[\u05D0-\u05EA]+|לא צריך ל[\u05D0-\u05EA]+)/i],
  ['marketing', /\b(?:unsubscribe|register now|sign up|shop now|webinar|\d+% off|limited time|last chance)\b|(?:להסרה|וובינר|ההרשמה פתוחה|הירשמו|מבצע|% הנחה)/i],
  ['payment-injection', /ignore (?:all |any )?(?:previous|prior) instructions|\bsystem:|new bank account|wire [^.]{0,20}(?:to|into) (?:the )?(?:new|this) account|account\s+\d{2}-\d{3}|התעלם מכל ההוראות|לחשבון הבנק החדש/i],
  ['undecided', /nothing (?:has been |was )?decided|not (?:yet )?decided|no decision yet|לא הוחלט|טרם הוחלט/i],
  ['quoted-only', /^\s*(?:fyi|fwd?|forwarding)[^\n]*\n\s*\n?\s*(?:on .{0,80} wrote:|-----original message-----)/i]
];
function v2Veto(c) {
  const body = String(c.body || '');
  for (const [name, re] of V2) if (re.test(body)) return name;
  return null;
}
let FILE_GATE = null;
function fileGate() { if (!FILE_GATE) { const T = require('../teacher/teacher.cjs'); FILE_GATE = T.DEPS.fileAttach; } return FILE_GATE; }
function capVeto(c, label, own) {
  if (!label || label === 'SILENT') return null;
  const step = label.split('|')[1];
  // A request about a named file belongs to the file chain (search -> attach / needs-you); a plain reply draft would be the
  // weaker substitute the engine refuses. Same FlowFileAttach.gate the incoming judge uses.
  if (step === 'draft') { const g = fileGate().gate(String(own != null ? own : c.body || '')); if (g && g.kind !== 'ignore') return 'cap:file-chain-owns'; }
  if (step === 'file_save' && Number(c.attachmentCount || 0) !== 1) return 'cap:save-needs-one-attachment';
  if (step === 'calendar' && c.surface === 'outlook') return 'cap:outlook-no-bare-calendar';
  if ((c.direction || 'inbound') === 'outbound') return 'cap:own-mail';
  return null;
}
module.exports = { baseVeto, v2Veto, capVeto, BASE, V2 };
