'use strict';
// v2.1 dataset (copy of v2 builder + bare/short shapes; v2 outputs untouched). Writes dataset/out-v21/.
// v2 dataset: v1 frames (same templateIds -> same split as v1) + v2 frames, live-shaped bodies, addressee/Cc structure,
// typo augmentation, repo rows carried over from v1 (same split). Reference label = engine 0.9.35 on the CLEAN render +
// product-correct overrides (ruleCorrected, NOT owner-verified). Writes dataset/out-v2/ only (v1 outputs untouched).
// Usage: node build-dataset-v2.cjs [--seed 11] [--min-per 16] [--max-per 40] [--target 700]
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { makeEngine, OWN } = require('../../teacher/engine.cjs');
const V1 = require('../templates.cjs'), V1X = require('../templates-extra.cjs'), V2 = require('../v2/templates-v2.cjs'), V21 = require('./templates-v21.cjs');
const S = require('./shapes-v21.cjs');
const { referenceLabel } = require('../v2/overrides.cjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const SEED = Number(opt('seed', 11)), MINP = Number(opt('min-per', 16)), MAXP = Number(opt('max-per', 40)), TARGET = Number(opt('target', 700));
const OUT = path.join(__dirname, '..', 'out-v21');
const MIX_OLD = { bare: Number(opt('bare', 0.3)), subjectOnly: Number(opt('subject-only', 0.03)) }, MIX_NEW = { bare: 0.6, subjectOnly: 0.06 }; fs.mkdirSync(OUT, { recursive: true });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const bucket = (id) => parseInt(sha('split:' + id).slice(0, 8), 16) % 100;
const E = makeEngine(process.env.GLANCE_V2_ENGINE || 'tip');
if (!E) throw new Error('No engine root. The default is this repo\'s flow-trial-extension (tip). Set GLANCE_ENGINE_ROOT to load a different unpacked extension.');
const CANON_SAVE = E.teach({ surface: 'outlook', direction: 'inbound', from: { name: 'Dana', email: 'dana@acme.io' }, to: [OWN.outlook], subject: '', body: 'Please save the attached file to OneDrive.', attachmentCount: 1 }).label;
const OWN_NAMES = S.OWN_NAMES;

// ---- frames
for (const [L, X] of [[V1.EN, V1X.en], [V1.HE, V1X.he]]) for (const [sc, list] of Object.entries(X)) { if (L.scenarios[sc]) L.scenarios[sc].t = L.scenarios[sc].t.concat(list); }
const META_DEFAULT = { en: { conditional: { subj: ['Re: {topic}', 'Budget question'], att: [0] }, quoted_forward: { subj: ['Fwd: {obj}'], att: [0] } }, he: { conditional: { subj: ['בהמשך ל{topic}', 'תקציב'], att: [0] } } };
const metaOf = (lang, sc) => { const L = lang === 'en' ? V1.EN : V1.HE; return (L.scenarios[sc] && { subj: L.scenarios[sc].subj, att: L.scenarios[sc].att || [0], dir: L.scenarios[sc].dir }) || (META_DEFAULT[lang][sc]) || { subj: lang === 'en' ? ['Re: {topic}'] : ['בהמשך ל{topic}'], att: [0] }; };
const slotsOf = (lang) => { const a = (lang === 'en' ? V1.EN : V1.HE).slots, b = lang === 'en' ? V2.EN_SLOTS : V2.HE_SLOTS; const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (k === 'hi' || k === 'bye') continue; o[k] = Array.from(new Set([...(a[k] || []), ...(b[k] || [])])); } return o; };
const SLOTS = { en: slotsOf('en'), he: slotsOf('he') };
const frames = []; const seenTpl = new Set();
for (const [lang, L] of [['en', V1.EN], ['he', V1.HE]]) for (const [sc, s] of Object.entries(L.scenarios)) s.t.forEach((t, i) => { frames.push({ lang, scenario: sc, tpl: t, templateId: lang + ':' + sc + ':' + i, origin: 'v1-frame' }); seenTpl.add(lang + '|' + t); });
let dupV2 = 0;
for (const [lang, L] of [['en', V2.EN], ['he', V2.HE]]) for (const [sc, list] of Object.entries(L)) list.forEach((t, i) => { if (seenTpl.has(lang + '|' + t)) { dupV2++; return; } seenTpl.add(lang + '|' + t); frames.push({ lang, scenario: sc, tpl: t, templateId: 'v2:' + lang + ':' + sc + ':' + i, origin: 'v2-frame' }); });
let dupV21 = 0; const SKEL_FILL = /\b(?:please|pls|kindly|thanks|thank you|thx|ty|tia|quick ask|just)\b|(?:^|\s)(?:בבקשה|תודה|נא|אנא|פליז)(?=\s|$)/gi;
const skel = (t) => String(t).toLowerCase().replace(SKEL_FILL, ' ').replace(/[^\p{L}\p{N}{} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const oldSk = frames.map((f) => ({ lang: f.lang, sk: skel(f.tpl), id: f.templateId }));
const splitOfId = (id) => { const b = bucket(id); return b < 20 ? 'test' : (b < 32 ? 'val' : 'train'); };
const RANK = { test: 0, val: 1, train: 2 }; const v21SkelId = {}; const nearDup = { exact: 0, contained: 0, sameSkeletonV21: 0 };
for (const [lang, L] of [['en', V21.EN], ['he', V21.HE]]) for (const [sc, list] of Object.entries(L)) list.forEach((t, i) => {
  if (seenTpl.has(lang + '|' + t)) { dupV21++; return; } seenTpl.add(lang + '|' + t);
  const id = 'v21:' + lang + ':' + sc + ':' + i, sk = skel(t);
  // phrasing-disjoint guard: a bare frame whose skeleton equals / is contained in an existing frame's skeleton inherits that
  // frame's split (the most held-out one if several), so a test phrasing never leaks into train through its short form.
  const hits = oldSk.filter((o) => o.lang === lang && sk.length >= 8 && (o.sk === sk || o.sk.includes(sk) || sk.includes(o.sk) && o.sk.length >= 12));
  let splitId = null;
  if (hits.length) { hits.sort((a, b) => RANK[splitOfId(a.id)] - RANK[splitOfId(b.id)]); splitId = hits[0].id; if (hits.some((h) => h.sk === sk)) nearDup.exact++; else nearDup.contained++; }
  else if (v21SkelId[lang + '|' + sk]) { splitId = v21SkelId[lang + '|' + sk]; nearDup.sameSkeletonV21++; }
  else v21SkelId[lang + '|' + sk] = id;
  frames.push({ lang, scenario: sc, tpl: t, templateId: id, splitId: splitId || id, origin: 'v21-frame' });
});
const perScen = {}; for (const f of frames) perScen[f.lang + ':' + f.scenario] = (perScen[f.lang + ':' + f.scenario] || 0) + 1;

const EXT = { en: [['Dana Levi', 'dana@acme.io'], ['Michael Ross', 'michael@northwind.com'], ['Sarah Cohen', 'sarah.cohen@globex.co'], ['Billing', 'billing@initech.com'], ['Tom Baker', 'tom@hooli.xyz'], ['Rachel Green', 'rachel@umbrella.io'], ['Ethan Hunt', 'ethan@initech.com']],
  he: [['דנה לוי', 'dana@acme.co.il'], ['מיכאל כהן', 'michael@globex.co.il'], ['יוסי אברהם', 'yossi@initech.co.il'], ['שרה מזרחי', 'sarah@northwind.co.il'], ['נועה פרץ', 'noa@monday-partner.co.il'], ['אבי בירנבאום', 'avi@cyber.co.il'], ['הילה שמש', 'hila@acme.co.il']] };
const COLL = { en: ['Dana', 'Michael', 'Noa', 'Avi', 'Maya', 'Omer', 'Lior', 'Rachel'], he: ['דנה', 'מיכאל', 'נועה', 'אבי', 'מאיה', 'עומר', 'ליאור', 'רחל', 'שירן', 'גיא'] };
const MKT = [['Promo Team', 'news@promo-mail.com'], ['Acme Updates', 'no-reply@acme-updates.io'], ['אקמי חדשות', 'news@acme-news.co.il']];
const ASKY = new Set(['request_reply', 'payment', 'meeting', 'reply_with_file', 'task_ask', 'commitment_reader', 'decision', 'sender_commitment', 'event_statement', 'decision_statement']);
const ADDRESSABLE = new Set(['sender_commitment', 'event_statement', 'decision_statement', 'request_reply', 'payment', 'commitment_reader', 'task_ask', 'meeting', 'drive_save', 'onedrive_save', 'shared_save', 'reply_with_file', 'file_place', 'create_doc', 'decision', 'hedge', 'negation', 'fyi', 'conditional', 'calendar_hold', 'cancelled', 'past', 'ack']);

const rows = []; const seen = new Set();
const stats = { formatSensitive: 0, typoSensitive: 0, ruleCorrected: {}, engineError: 0 };
function label(row, body) { return E.teach(Object.assign({}, row, { body })); }
function finish(row, cleanBody) {
  const key = sha([row.surface, row.direction, row.attachmentCount, row.subject, row.body, (row.cc || []).join(',')].join('\u0001'));
  if (seen.has(key)) return false; seen.add(key); row.hash = key.slice(0, 16);
  const eClean = label(row, cleanBody), eLive = label(row, row.body);
  if (eLive.reason === 'engine-error') stats.engineError++;
  const ownText = E.preprocess(Object.assign({}, row, { body: cleanBody })).own;
  const ref = referenceLabel(eClean.label, { surface: row.surface, direction: row.direction, attachmentCount: row.attachmentCount, subject: row.subject, own: ownText, to: row.to, cc: row.cc, ownEmail: OWN[row.surface], ownNames: OWN_NAMES }, CANON_SAVE);
  row.engine35 = { label: eLive.label, reason: eLive.reason, family: eLive.family, primaryStep: eLive.primaryStep };
  row.engine35Clean = eClean.label;
  row.formatSensitive = eLive.label !== eClean.label; if (row.formatSensitive) stats.formatSensitive++;
  row.reference = { label: ref.label, show: ref.label !== 'SILENT', source: ref.rules.length ? 'rule-corrected' : 'engine-0.9.35', ruleCorrected: ref.rules, ownerVerified: false };
  row.engine35CleanReason = eClean.reason;
  // engine-recall gap: the engine said nothing (intent-null, i.e. NOT a rule silence) on an ask-shaped frame addressed to the
  // user and no product rule fired. Label stays SILENT (strict) but is flagged unsure: not trained as silence or as show,
  // reported separately, and the best of these go to the owner-label batch.
  row.reference.unsure = Boolean(row.provenance === 'synthetic-v2' && ref.label === 'SILENT' && ref.rules.length === 0 && eClean.reason === 'intent-null' && (
    (row.direction === 'inbound' && ASKY.has(row.scenario) && ref.voc !== 'other' && ref.role === 'to') ||
    (row.direction === 'self' && row.scenario === 'own_commitment_self') ||
    // v2.1: Gmail Drive saves with exactly one attachment and Gmail calendar holds that the engine left at intent-null are the
    // same engine-recall gap (not a product silence); masking them keeps "save this to Drive" from being taught as silence.
    (row.direction === 'inbound' && row.surface === 'gmail' && ref.voc !== 'other' && ref.role === 'to' && ((row.scenario === 'drive_save' && row.attachmentCount === 1) || row.scenario === 'calendar_hold'))));
  if (row.reference.unsure) { row.reference.unsureReason = 'engine-recall-gap'; stats.unsure = (stats.unsure || 0) + 1; }
  row.addressee = { voc: ref.voc, role: ref.role };
  for (const r of ref.rules) stats.ruleCorrected[r] = (stats.ruleCorrected[r] || 0) + 1;
  rows.push(row); return true;
}

let rowSeed = SEED * 1000003;
for (const f of frames) {
  const meta = metaOf(f.lang, f.scenario);
  const per = Math.min(MAXP, Math.max(MINP, Math.ceil(TARGET / perScen[f.lang + ':' + f.scenario])));
  const fr = S.mkRng(parseInt(sha(SEED + ':' + f.templateId).slice(0, 8), 16));
  let made = 0, tries = 0;
  while (made < per && tries < per * 6) {
    tries++;
    const seed = (rowSeed = (rowSeed + 0x9E3779B1) | 0);
    const r = S.mkRng(seed);
    const fillS = (str, d) => String(str).replace(/\{(\w+)\}/g, (m, k) => (SLOTS[f.lang][k] ? ((d || 0) < 2 ? fillS(r.pick(SLOTS[f.lang][k]), (d || 0) + 1) : r.pick(SLOTS[f.lang][k])) : m));
    const surface = r.rnd() < 0.5 ? 'gmail' : 'outlook'; const own = OWN[surface];
    let direction = meta.dir ? r.pick(meta.dir) : 'inbound';
    const dx = r.rnd(); if (!meta.dir && dx < 0.08) direction = 'outbound'; else if (!meta.dir && dx < 0.12) direction = 'self';
    const ext = f.scenario === 'marketing' ? r.pick(MKT) : r.pick(EXT[f.lang]);
    const senderFirst = ext[0].split(' ')[0];
    const colleague = r.pick(COLL[f.lang].filter((n) => n !== senderFirst));
    const collEmail = (colleague.match(/[a-z]/i) ? colleague.toLowerCase() : 'colleague' + (colleague.length)) + '@' + ext[1].split('@')[1];
    const plan = direction === 'inbound' && ADDRESSABLE.has(f.scenario) ? S.planAddressee(r, f.lang, colleague) : { voc: 'none', greet: direction === 'inbound' ? r.pick(S.GREET[f.lang].none) : '', inline: null, ccOnly: false };
    const from = direction === 'inbound' ? { name: ext[0], email: ext[1] } : { name: 'Sali Sapan', email: own };
    let to, cc = [];
    if (direction === 'outbound') to = [ext[1]];
    else if (direction === 'self') to = [own];
    else if (plan.ccOnly) { to = [collEmail]; cc = [own]; }
    else if (plan.voc === 'other') to = [collEmail, own];
    else if (f.scenario === 'third_party') to = ['colleague@acme.io', own];
    else { to = [own]; if (r.rnd() < 0.15) cc = [collEmail]; }
    const core = fillS(f.tpl);
    const subject = S.subjectPrefix(r, f.lang, fillS(r.pick(meta.subj)));
    const attachmentCount = r.pick(meta.att || [0]);
    const renderSeed = parseInt(sha('r' + seed).slice(0, 8), 16);
    const rd = S.renderV21(S.mkRng(renderSeed), { lang: f.lang, core, plan, senderFirst: direction === 'inbound' ? senderFirst : 'Sali', senderFull: direction === 'inbound' ? ext[0] : 'Sali Sapan' }, f.origin === 'v21-frame' ? MIX_NEW : MIX_OLD);
    const subjectUsed = rd.subject != null ? rd.subject : subject;
    const base = { id: 'v21syn-' + rows.length, provenance: 'synthetic-v2', frameOrigin: f.origin, ownerVerified: false, lang: f.lang, scenario: f.scenario, templateId: f.templateId, splitId: f.splitId || f.templateId,
      surface, direction, from, to, cc, ownNames: OWN_NAMES, subject: subjectUsed, body: rd.live, cleanBody: rd.clean, render: { style: rd.style, noise: rd.noise, addresseePlan: plan.voc }, attachmentCount, augment: null };
    if (!finish(base, rd.clean)) continue;
    made++;
    if (r.rnd() < 0.08) { // typo twin: same structure, typo'd core; label inherits the clean row's reference
      const tc = S.typo(r, core, f.lang);
      if (tc) {
        if (rd.style === 'subject-only') continue;
        const td = rd.style === 'bare' ? (() => { const b = S.bare(S.mkRng(renderSeed + 1), f.lang, tc, plan); return { clean: b, live: b }; })() : S.render(S.mkRng(renderSeed), { lang: f.lang, core: tc, plan, senderFirst: direction === 'inbound' ? senderFirst : 'Sali', senderFull: direction === 'inbound' ? ext[0] : 'Sali Sapan' });
        const tw = Object.assign({}, base, { id: 'v21syn-' + rows.length, body: td.live, cleanBody: rd.clean, typoBody: td.clean, augment: 'typo' });
        const key = sha([tw.surface, tw.direction, tw.attachmentCount, tw.subject, tw.body, cc.join(',')].join('\u0001'));
        if (!seen.has(key)) {
          seen.add(key); tw.hash = key.slice(0, 16);
          const eT = label(tw, tw.body);
          tw.engine35 = { label: eT.label, reason: eT.reason, family: eT.family, primaryStep: eT.primaryStep };
          tw.typoSensitive = eT.label !== base.engine35.label; if (tw.typoSensitive) stats.typoSensitive++;
          tw.reference = Object.assign({}, base.reference, { ruleCorrected: base.reference.ruleCorrected.concat(['typo-invariant']), source: 'rule-corrected' });
          rows.push(tw);
        }
      }
    }
  }
}
const nSyn = rows.length;
// ---- repo rows: carried over from v1 (same text, same split), relabelled
const v1all = fs.readFileSync(path.join(__dirname, '..', 'out', 'all.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
for (const v of v1all) {
  if (v.provenance === 'synthetic') continue;
  const row = { id: 'v21' + v.id, provenance: v.provenance, ownerVerified: false, lang: v.lang, scenario: v.scenario, templateId: v.templateId, surface: v.surface, direction: v.direction, from: v.from, to: v.to, cc: [], ownNames: OWN_NAMES,
    subject: v.subject, body: v.body, cleanBody: v.body, attachmentCount: v.attachmentCount, augment: null, v1Split: v.split, repoLabel: v.repoLabel || null };
  finish(row, v.body);
}
for (const r of rows) {
  if (r.v1Split) r.split = r.v1Split;
  else { const b = bucket(r.splitId || r.templateId); r.split = b < 20 ? 'test' : (b < 32 ? 'val' : 'train'); }
}
const w = (name, arr) => fs.writeFileSync(path.join(OUT, name), arr.map((r) => JSON.stringify(r)).join('\n') + '\n');
w('all.jsonl', rows); for (const s of ['train', 'val', 'test']) w(s + '.jsonl', rows.filter((r) => r.split === s));
const by = (fn) => { const o = {}; for (const r of rows) { const k = fn(r); o[k] = o[k] || { n: 0, show: 0 }; o[k].n++; if (r.reference.show) o[k].show++; } return o; };
const frameCounts = {}; for (const f of frames) { const k = f.origin + ':' + f.lang; frameCounts[k] = (frameCounts[k] || 0) + 1; }
const summary = { builtAt: new Date().toISOString(), reference: 'engine 0.9.35 (clean render) + product-correct overrides; ownerVerified=0', canonicalOneDriveSaveLabel: CANON_SAVE,
  frames: { total: frames.length, ...frameCounts, droppedDuplicateV2: dupV2, droppedDuplicateV21: dupV21, v21NearDupInheritedSplit: nearDup }, total: rows.length, synthetic: nSyn, repo: rows.length - nSyn,
  bySplit: by((r) => r.split), bySource: by((r) => (r.provenance.startsWith('synthetic') ? r.provenance + ':' + r.frameOrigin : r.provenance.split(':')[0])), byLang: by((r) => r.lang), bySplitLang: by((r) => r.split + ':' + r.lang),
  byAddressee: by((r) => (r.addressee ? r.addressee.voc + '/' + r.addressee.role : 'n/a')), typoRows: rows.filter((r) => r.augment === 'typo').length, byStyle: by((r) => (r.render ? r.render.style : 'repo')), bySplitStyle: by((r) => r.split + ':' + (r.render ? r.render.style : 'repo')), byOriginSplit: by((r) => (r.frameOrigin || 'repo') + ':' + r.split),
  ruleCorrected: stats.ruleCorrected, unsureEngineRecallGap: rows.filter((r) => r.reference.unsure).length, unsureByLang: by((r) => (r.reference.unsure ? 'unsure:' + r.lang : 'sure:' + r.lang)), formatSensitive: stats.formatSensitive, typoSensitive: stats.typoSensitive, engineError: stats.engineError,
  referenceLabels: by((r) => r.reference.label), engineVsReferenceDisagree: rows.filter((r) => r.engine35.label !== r.reference.label).length };
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 1));
