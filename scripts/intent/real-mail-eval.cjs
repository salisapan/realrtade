#!/usr/bin/env node
// The real-mail gold set: masked sentences from the owner's own mail, labels assigned by a model and not
// checked by the owner. Evaluation only. Never train on these sentences.
//   node scripts/intent/real-mail-eval.cjs [--json out.json] [--errors]
// Intent rows use the shipped pipeline the way scripts/intent/human-eval.cjs does (unsure, INFORM and ACK are
// SILENT). Reply rows use FlowFollowUp.classifyReply (closed / paid / declined are CLOSE; everything else HOLDs).
// A row with quoted_own_text is also checked after the shared quote cut: the quoted ask must not survive as an
// incoming ASK. dogfood_test is reported on its own line and left out of the real-only line.
// confidence "unsure" stays in the file and out of every headline number. close_as requires that outcome
// (a done-close is not a declined-close). An attachment_only row is scored as an empty body plus one file.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'flow-trial-extension');
const FILE = path.join(ROOT, 'test', 'fixtures', 'real-mail-gold.json');
const M = require(path.join(ROOT, 'core', 'intent-model.js')).FlowIntentModel;
const W = require(path.join(ROOT, 'core', 'intent-model-weights.js')).FlowIntentWeights;
const P = require(path.join(ROOT, 'core', 'intent-pipeline.js')).FlowIntentPipeline;
const RT = require(path.join(ROOT, 'core', 'request-types.js')).FlowRequestTypes;
const F = require(path.join(ROOT, 'core', 'follow-up.js')).FlowFollowUp;
const E = require(path.join(ROOT, 'core', 'extract.js')).FlowExtract;
const G = require(path.join(ROOT, 'core', 'graph-mail.js')).FlowGraphMail;
const FP = require(path.join(ROOT, 'core', 'file-path.js')).FlowFilePath;
M.load(W);

const gold = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const NOW = new Date('2026-10-06T09:00:00Z').getTime();
const WATCH = { kind: 'reply', status: 'waiting', direction: 'theirs' };
const CLASSES = ['ASK', 'PROMISE', 'HOLD', 'CLOSE', 'SILENT'];
const ctx = { now: NOW, extract: E, types: RT, pipeline: P };

function intentOf(text) {
  const r = P.recognize(text);
  const label = (!r.unsure && (r.act === 'ASK' || r.act === 'PROMISE')) ? r.act : 'SILENT';
  return { label, raw: r.unsure ? 'X' : r.act, tier: r.tier, unsure: r.unsure };
}
function replyOf(text, evidence) {
  const ctx = { now: NOW, extract: E };
  if (evidence) ctx.evidence = evidence;
  const r = F.classifyReply(text, WATCH, ctx);
  const label = (r.outcome === 'closed' || r.outcome === 'paid' || r.outcome === 'declined') ? 'CLOSE' : 'HOLD';
  return { label, outcome: r.outcome, basis: r.basis, why: r.why || '' };
}
// An attachment-only reply is stored as a description, never as raw mail. Score the empty body plus one file.
function measure(c) {
  if (c.attachment_only) return { text: '', evidence: FP.evidence({ text: '', attachments: [{ filename: 'image.png' }] }) };
  return { text: c.text, evidence: null };
}
function loopOf(text) {
  const prom = F.classifyCommitment(text, ctx);
  if (prom) return 'PROMISE';
  const out = F.classifyOutgoing(text, ctx);
  if (out) return 'ASK';
  return 'SILENT';
}
// The quoted ask must not remain in the words the engine judges. Hebrew Gmail marks the cut with
// "הודעה שהועברה"; English uses "Forwarded message". Both go through the same ownText cut.
function quoteLeak(row) {
  if (!row.quoted_own_text) return false;
  const full = row.text + '\n\n---------- הודעה שהועברה ---------\n' + row.quoted_own_text;
  const own = G.ownText(full);
  if (own.indexOf(row.quoted_own_text.slice(0, 16)) !== -1) return true;
  return P.analyze(own).some((x) => !x.unsure && (x.act === 'ASK' || x.act === 'PROMISE'));
}

const rows = gold.cases.map((c) => {
  const m = measure(c);
  const intent = c.task === 'intent' ? intentOf(m.text) : null;
  const reply = (c.task === 'reply' || c.reply_label || (c.close_as && c.close_as.length)) ? replyOf(m.text, m.evidence) : null;
  const pred = c.task === 'reply' ? reply.label : intent.label;
  const leak = quoteLeak(c);
  // A reply row is not a new loop. The own-loop check is for intent rows only.
  const loop = c.direction === 'own' && c.task === 'intent' ? loopOf(c.text) : null;
  const closeAsOk = !c.close_as || !c.close_as.length || (reply && c.close_as.indexOf(reply.outcome) !== -1);
  const replyOk = !c.reply_label || (reply && reply.label === c.reply_label);
  // A close of the wrong kind (done, when the label required declined) is not a hit.
  const classPred = closeAsOk ? pred : 'OTHER';
  return {
    id: c.id, lang: c.lang, source: c.source, family: c.family, direction: c.direction,
    task: c.task, gold: c.label, pred: classPred, rawPred: pred, leak, loop,
    confidence: c.confidence || 'clear', closeAsOk, replyOk,
    ok: classPred === c.label && !leak && (loop == null || loop === c.label) && closeAsOk && replyOk,
    detail: intent || reply
  };
});

function prf(set) {
  const out = {};
  for (const cls of CLASSES) {
    let tp = 0, fp = 0, fn = 0;
    for (const g of set) {
      const w = g.gold === cls, h = g.pred === cls;
      if (w && h) tp++;
      else if (!w && h) fp++;
      else if (w && !h) fn++;
    }
    const n = tp + fn;
    out[cls] = {
      n, tp, fp, fn,
      precision: tp + fp ? +(tp / (tp + fp)).toFixed(3) : null,
      recall: n ? +(tp / n).toFixed(3) : null
    };
  }
  return out;
}
function familyTable(set) {
  const names = [];
  for (const g of set) if (names.indexOf(g.family) === -1) names.push(g.family);
  return names.map((family) => {
    const rowsF = set.filter((g) => g.family === family);
    const label = rowsF[0].gold;
    const tp = rowsF.filter((g) => g.pred === label && !g.leak).length;
    const fp = set.filter((g) => g.family !== family && g.pred === label).length;
    return { family, label, n: rowsF.length, tp, fp, fn: rowsF.length - tp, precision: tp + fp ? +(tp / (tp + fp)).toFixed(3) : null, recall: rowsF.length ? +(tp / rowsF.length).toFixed(3) : null };
  });
}
function line(title, set) {
  const bits = CLASSES.map((cls) => {
    const s = prf(set)[cls];
    if (!s.n && !s.fp) return null;
    return cls + ' n=' + s.n + ' tp=' + s.tp + ' fp=' + s.fp + ' fn=' + s.fn + ' P=' + s.precision + ' R=' + s.recall;
  }).filter(Boolean);
  console.log(title + ' (n=' + set.length + ')');
  bits.forEach((b) => console.log('  ' + b));
}

// confidence 'unsure' stays in the file and out of every headline number.
const unsureRows = rows.filter((g) => g.confidence === 'unsure');
const scored = rows.filter((g) => g.confidence !== 'unsure');
const real = scored.filter((g) => g.source !== 'dogfood_test');
const dog = scored.filter((g) => g.source === 'dogfood_test');
const legacy = scored.filter((g) => /^rm-0/.test(g.id));
const showErrors = process.argv.includes('--errors');

console.log('real-mail gold set  ' + gold.collected + '  sentences=' + rows.length + '  headline=' + scored.length + '  real=' + real.length + '  dogfood_test=' + dog.length + '  unsure=' + unsureRows.length);
console.log('labels are model-assigned and not owner-checked; n is tiny; not for training');
console.log('confidence unsure is excluded from every headline number below');
console.log('');
line('ALL headline', scored);
line('REAL-ONLY (excludes dogfood_test and unsure)', real);
line('DOGFOOD (excludes unsure)', dog);
line('LEGACY rm-001..rm-022', legacy);
console.log('');
for (const lang of ['he', 'en']) {
  line(lang.toUpperCase() + ' headline', scored.filter((g) => g.lang === lang));
  line(lang.toUpperCase() + ' real-only', real.filter((g) => g.lang === lang));
  line(lang.toUpperCase() + ' dogfood', dog.filter((g) => g.lang === lang));
}
console.log('');
function printFamilies(title, set) {
  console.log(title);
  familyTable(set).forEach((f) => console.log('  ' + f.family + ' label=' + f.label + ' n=' + f.n + ' tp=' + f.tp + ' fp=' + f.fp + ' fn=' + f.fn + ' P=' + f.precision + ' R=' + f.recall));
}
console.log('per family (precision shares a label with every other family that uses it; recall is this family only)');
printFamilies('per family, headline', scored);
printFamilies('per family, real-only', real);
printFamilies('per family, dogfood', dog);
printFamilies('per family, he real-only', real.filter((g) => g.lang === 'he'));
printFamilies('per family, en real-only', real.filter((g) => g.lang === 'en'));
printFamilies('per family, he dogfood', dog.filter((g) => g.lang === 'he'));
printFamilies('per family, en dogfood', dog.filter((g) => g.lang === 'en'));

const misses = scored.filter((g) => !g.ok);
console.log('');
console.log('headline misses ' + misses.length);
misses.forEach((g) => {
  const extra = (g.leak ? ' quote-leak' : '') + (g.loop && g.loop !== g.gold ? ' own-loop=' + g.loop : '') + (g.closeAsOk ? '' : ' close-as') + (g.replyOk ? '' : ' reply-constraint');
  console.log('  ' + g.id + ' ' + g.lang + ' ' + g.source + ' ' + g.family + ' gold=' + g.gold + ' pred=' + g.pred + extra + ' ' + JSON.stringify(g.detail));
});
console.log('unsure (not in headline) ' + unsureRows.length);
unsureRows.forEach((g) => console.log('  ' + g.id + ' ' + g.lang + ' ' + g.source + ' gold=' + g.gold + ' pred=' + g.pred + ' ok=' + g.ok));
const loopMiss = rows.filter((g) => g.loop && g.loop !== g.gold);
console.log('own-loop disagreements ' + loopMiss.length + (loopMiss.length ? ': ' + loopMiss.map((g) => g.id + ' loop=' + g.loop + ' gold=' + g.gold).join('; ') : ''));
if (showErrors) rows.forEach((g) => console.log(g.id, g.ok ? 'ok' : 'MISS', g.gold, g.pred));

const out = {
  collected: gold.collected, sentences: rows.length, headline: scored.length, real: real.length, dogfood: dog.length, unsure: unsureRows.length,
  all: prf(scored), realOnly: prf(real), dogfoodOnly: prf(dog), legacy: prf(legacy),
  byLang: { he: prf(scored.filter((g) => g.lang === 'he')), en: prf(scored.filter((g) => g.lang === 'en')) },
  byLangReal: { he: prf(real.filter((g) => g.lang === 'he')), en: prf(real.filter((g) => g.lang === 'en')) },
  byLangDog: { he: prf(dog.filter((g) => g.lang === 'he')), en: prf(dog.filter((g) => g.lang === 'en')) },
  families: familyTable(scored), familiesReal: familyTable(real), familiesDog: familyTable(dog),
  familiesHeReal: familyTable(real.filter((g) => g.lang === 'he')),
  familiesEnReal: familyTable(real.filter((g) => g.lang === 'en')),
  familiesHeDog: familyTable(dog.filter((g) => g.lang === 'he')),
  familiesEnDog: familyTable(dog.filter((g) => g.lang === 'en')),
  misses: misses.map((g) => ({ id: g.id, lang: g.lang, source: g.source, family: g.family, gold: g.gold, pred: g.pred, leak: g.leak, loop: g.loop, closeAsOk: g.closeAsOk, replyOk: g.replyOk })),
  unsureRows: unsureRows.map((g) => ({ id: g.id, lang: g.lang, source: g.source, family: g.family, gold: g.gold, pred: g.pred, ok: g.ok })),
  ownLoopDisagreements: loopMiss.map((g) => ({ id: g.id, loop: g.loop, gold: g.gold }))
};
const i = process.argv.indexOf('--json');
if (i > -1) fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 2));
