'use strict';
// Spec re-check of v2 held-out labels after the suggest-save product change (specs/suggest-save.md §1-3, §9).
// v2 reference labels are engine-0.9.35 labels + product-rule corrections. Rule (2) in model/runtime/product-rules.cjs already turns an
// explicit Outlook+OneDrive save with exactly one attachment into file_save. The new spec makes attachment saving a supported step on
// BOTH hosts (Drive on Gmail, OneDrive on Outlook) and for n>=2 files ("save the attachments" -> one attachmentSave step).
// Rule 'explicit-save-real-attachment' (applied to every v2 held-out row, never by id): a SILENT row with NO silence rule fired becomes
// file_save iff ALL hold:
//   inbound; explicit save ask (SAVE_VERB + attachment reference); the named target is the HOST's storage (Gmail: Drive and not OneDrive;
//   Outlook: OneDrive and not Google Drive / bare Drive); not negated / hedged / marketing / conditional / negated-only; not addressed to
//   a named colleague; user not cc-only; attachmentCount >= 1 (generator says a real PDF is attached); and suggest-save.js says
//   suggest:show on that row with the declared files modelled as real PDFs (so every other suggest-save rule also holds).
// Outlook naming "Drive"/"Google Drive" and Gmail naming OneDrive stay SILENT (wrong target, spec §1, §7, §9).
const fs = require('fs'), path = require('path');
const { EVAL, ROOT: AI } = require('../../../paths.cjs');
const PR = require(path.join(AI, 'model/runtime/product-rules.cjs'));
const SS = require(path.join(AI, 'model/suggest-save/suggest-save.js'));
const { ONEDRIVE, SAVE_VERB, NEG_SAVE, HEDGE, MARKETING, CONDITIONAL } = PR.RX;
const GDRIVE_ANY = /\bg(?:oogle)?\s*-?drive\b|(?<!one\s?-?)\bdrive\b|(?<!וואן\s?-?)דרייב|גוגל\s*דרייב/i;
const ATT_REF = /\battach(?:ed|ment|ments)?\b|\benclosed\b|\bthe\s+(?:pdf|file|files)\b|מצורף|המצורף|המצורפת|המצורפים|הקובץ|הקבצים/i;
const OWN = { gmail: 'ai.local.flow@gmail.com', outlook: 'glance.salisapan@outlook.com' };
const OWN_NAMES = ['Sali', 'Sali Sapan', 'סאלי'];
function realPdfs(n) { return Array.from({ length: n }, (_, i) => ({ id: 'a' + (i + 1), name: `attachment${i + 1}.pdf`, contentType: 'application/pdf', size: 240 * 1024, isInline: false, contentId: null, kind: 'file' })); }
function check(r, own, engineReason) {
  if (r.reference.label !== 'SILENT' || (r.reference.ruleCorrected || []).some((x) => x !== 'typo-invariant')) return null;
  if (r.direction !== 'inbound') return null;
  const t = String(own || '');
  if (!(SAVE_VERB.test(t) && ATT_REF.test(t))) return null;
  const surface = r.surface === 'outlook' ? 'outlook' : 'gmail';
  const od = ONEDRIVE.test(t), gd = GDRIVE_ANY.test(t.replace(/one\s?-?drive|וואן\s?-?דרייב/gi, ' '));
  if (surface === 'gmail' && (!gd || od)) return null;
  if (surface === 'outlook' && (!od || gd)) return null;
  if (NEG_SAVE.test(t) || HEDGE.test(t) || MARKETING.test(t) || MARKETING.test(r.subject || '') || CONDITIONAL.test(t) || PR.negatedOnly(t)) return null;
  const voc = PR.addresseeOf(t, OWN_NAMES), role = PR.recipientRole({ to: r.to, cc: r.cc }, OWN[surface]);
  if (voc === 'other' || role === 'cc-only') return null;
  const n = r.attachmentCount || 0; if (n < 1) return null;
  const d = SS.decide({ surface, direction: 'inbound', consent: true, attachmentsRead: true, attachments: realPdfs(n), bodyCids: [], headers: {}, text: t, subject: r.subject || '',
    judgment: { reason: engineReason, explicit: null, marketing: false }, messageId: r.id });
  if (!d.suggest) return null;
  return { rule: 'explicit-save-real-attachment', voc, role, n, target: d.target, why: `explicit ${surface === 'gmail' ? 'Drive-on-Gmail' : 'OneDrive-on-Outlook'} save ask, ${n} declared attachment(s), not negated/hedged/marketing, addressed ${voc}/${role}; suggest-save.js -> suggest:show` };
}
module.exports = { check, realPdfs };
if (require.main === module) {
  const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').map(JSON.parse);
  const cases = read(EVAL.shadowCases()).filter((c) => c.set === 'v2test');
  const src = Object.fromEntries(read(EVAL.v2Test()).map((r) => [r.id, r]));
  const out = [];
  for (const c of cases) { const r = src[c.id]; const k = check(r, c.own, c.engineReason); if (k) out.push(Object.assign({ id: c.id, lang: c.lang, surface: c.surface, scenario: c.gold.scenario, from: 'SILENT', to: 'file_save', own: c.own.slice(0, 120) }, k)); }
  // near-misses: drive/onedrive save scenarios left SILENT, with the reason they stay SILENT
  fs.writeFileSync(__dirname + '/relabels.json', JSON.stringify(out, null, 1));
  console.log(out.length, 'relabels'); for (const o of out) console.log(o.id, o.lang, o.surface, JSON.stringify(o.own), '|', o.why);
}
