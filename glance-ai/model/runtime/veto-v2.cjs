'use strict';
// v2 hard-veto layer (silence-only; can never add a card).
//  base    = engine 0.9.35 rule-silences, computed on the NORMALIZED body (same set as v1: quiet/family gates, own mail,
//            capability, chains that own the case). intent-null / low-confidence are not vetoes (model territory).
//  product = the confirmed product rules (runtime/product-rules.cjs) + v1 proposed injection / quoted-only rules.
//  cap     = label-dependent: save needs exactly 1 attachment, negated save, Outlook has no bare calendar, a draft on a
//            named-file ask belongs to the file chain, no reply draft on a note-to-self, own mail.
const { BASE } = require('./veto.cjs');
const PR = require('./product-rules.cjs');
const { RX, negatedOnly, addresseeOf, recipientRole } = PR;
const INJECT = /ignore (?:all |any )?(?:previous|prior) instructions|\bsystem:|new bank account|wire [^.]{0,20}(?:to|into) (?:the )?(?:new|this) account|account\s+\d{2}-\d{3}|התעלם מכל ההוראות|לחשבון הבנק החדש|חשבון בנק חדש/i;
const QUOTED_ONLY = /^\s*(?:fyi|fwd?|forwarding|להלן|מעביר)[^\n]*\n\s*\n?\s*(?:on .{0,80} wrote:|-----\s*original message|-{5,}\s*forwarded message|בתאריך .{0,80} נכתב:)/i;
// a save to a place this surface cannot write (shared folder / SharePoint / Dropbox / Box) is not a Drive/OneDrive save
const OTHER_TARGET = /\bshared\s+(?:folder|drive)\b|\bsharepoint\b|\bdropbox\b|\bbox\.com\b|\bteams\s+(?:folder|channel)\b|(?:ה)?תיקי(?:י)?ה\s+המשותפת|שרפוינט|דרופבוקס/i;
function baseVeto(engine) { if (!engine || engine.show) return null; const r = engine.reason || ''; return BASE.has(r) || r.startsWith('calendar-') ? r : null; }
function productVeto(c, own, ownEmail) {
  if ((c.direction || 'inbound') !== 'inbound') return null;
  const voc = addresseeOf(own, c.ownNames || []), role = recipientRole(c, ownEmail);
  if (INJECT.test(own)) return 'payment-injection';
  if (QUOTED_ONLY.test(String(c.body || ''))) return 'quoted-only';
  if (negatedOnly(own)) return 'negated-ask';
  if (c.surface === 'gmail' && RX.ONEDRIVE.test(own) && RX.SAVE_VERB.test(own)) return 'gmail-onedrive-target';
  if ((RX.NO_ACTION_HE.test(own) || RX.NO_ACTION_EN.test(own)) && !RX.POS_ACTION_HE.test(own)) return 'no-action-fyi';
  if (voc === 'other') return 'addressed-to-other';
  if (role === 'cc-only' && voc !== 'own') return 'cc-only';
  if (RX.MARKETING.test(own) || RX.MARKETING.test(c.subject || '')) return 'marketing';
  if (RX.CONDITIONAL.test(own)) return 'conditional-undecided';
  if (RX.SAVE_VERB.test(own) && OTHER_TARGET.test(own)) return 'save-target-not-drive';
  return null;
}
let FILE_GATE = null;
function capFlags(c, own, fileAttach) {
  const g = fileAttach && fileAttach.gate ? fileAttach.gate(own) : null;
  return { draft: (c.direction || 'inbound') === 'self' ? 'cap:no-draft-to-self' : (g && g.kind !== 'ignore' ? 'cap:file-chain-owns' : null),
    file_save: Number(c.attachmentCount || 0) !== 1 ? 'cap:save-needs-one-attachment' : (RX.NEG_SAVE.test(own) ? 'cap:negated-save' : (OTHER_TARGET.test(own) ? 'cap:save-target-not-drive' : null)),
    calendar: c.surface === 'outlook' ? 'cap:outlook-no-bare-calendar' : null,
    any: (c.direction || 'inbound') === 'outbound' ? 'cap:own-mail' : null };
}
function capVeto(flags, label) { if (!label || label === 'SILENT') return null; const step = label.split('|')[1]; return flags.any || flags[step] || null; }
module.exports = { baseVeto, productVeto, capFlags, capVeto };
