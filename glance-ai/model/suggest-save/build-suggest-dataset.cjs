'use strict';
// v2.2 suggest-save target over the v2 dataset. The dataset has only `attachmentCount` (real files as the engine sees them), so a
// principled, seeded ATTACHMENT-META LAYER is synthesized per row (file name / type / size / isInline / cid / kind, List-Unsubscribe /
// Precedence, sender-is-user, read failures, consent, saved / dismissed state), then the deterministic rule (suggest-save.js) labels it.
// Sample: every row with attachmentCount >= 1 + 3,000 seeded rows with 0 (all splits, directions) + the 22 spec corpus rows (24 cases).
// target = 'suggest-save' when the rule shows the chip, else the product-correct reference label (SILENT or the explicit card).
// Output: ../dataset/out-v22/suggest-save.jsonl + suggest-save.summary.json. Deterministic (seed per row id).
const fs = require('fs'), path = require('path');
const M = path.join(__dirname, '..');
const S = require('./suggest-save.js');
const P = require('../shadow-pkg/src/gs-prepare.js'), T = require('../shadow-pkg/src/gs-text.js');
const { loadCore, OWN, NOW } = require('../shadow-pkg/test/core-loader.cjs');
const core = loadCore();
const OUT = path.join(M, 'dataset', 'out-v22'); fs.mkdirSync(OUT, { recursive: true });
const K = 1024, MB = 1024 * K;
function rng(seedStr) { let h = T.fnv1a('ss22:' + seedStr) || 1; return () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const logU = (r, lo, hi) => Math.round(Math.exp(Math.log(lo) + r() * (Math.log(hi) - Math.log(lo))));
const pick = (r, a) => a[Math.floor(r() * a.length)];
const CUES = [[/invoice|חשבונית/i, ['invoice-1042.pdf', 'Invoice_Oct.pdf', 'חשבונית-אוקטובר.pdf']], [/receipt|קבלה/i, ['receipt.pdf', 'receipt-scan.jpg']], [/contract|agreement|הסכם|חוזה/i, ['contract-v3.docx', 'Agreement_signed.pdf', 'הסכם.pdf']],
  [/\bnda\b/i, ['NDA.pdf']], [/w-?9/i, ['W-9.pdf']], [/resume|\bcv\b|קורות חיים/i, ['CV_Dana.pdf', 'resume.docx']], [/deck|slides|presentation|מצגת/i, ['Q4-deck.pptx', 'מצגת.pptx']],
  [/budget|spreadsheet|sheet|xlsx|forecast|תקציב|גיליון/i, ['budget-2027.xlsx', 'forecast.xlsx', 'data.csv']], [/report|דוח/i, ['Q3-report.pdf', 'דוח-רבעוני.pdf']], [/scan|סריקה|photo|תמונה/i, ['scan.jpg', 'IMG_2231.HEIC']]];
const GENERIC = ['document.pdf', 'notes.docx', 'summary.pdf', 'proposal.pdf', 'quote.pdf', 'scan.jpg', 'minutes.docx', 'specs.pdf', 'plan.xlsx'];
function realFile(r, own, i, gmail) {
  let name = null; for (const [rx, names] of CUES) if (rx.test(own)) { name = pick(r, names); break; }
  if (!name || i > 0) name = i > 0 ? pick(r, GENERIC).replace(/(\.\w+)$/, '-' + (i + 1) + '$1') : pick(r, GENERIC);
  const ext = name.split('.').pop().toLowerCase();
  const img = ['jpg', 'jpeg', 'png', 'heic'].includes(ext);
  const size = r() < 0.015 && !img ? logU(r, 300, 1900) : (img ? logU(r, 150 * K, 3 * MB) : logU(r, 20 * K, 4 * MB));
  const ct = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv: 'text/csv', jpg: 'image/jpeg', heic: 'image/heic' }[ext] || 'application/octet-stream';
  return { id: 'f' + i, name, contentType: ct, size, isInline: false, contentId: gmail && r() < 0.3 ? '<f_' + Math.floor(r() * 1e8).toString(36) + '>' : null, kind: 'file' };
}
function layer(row, own) {
  const r = rng(row.id), gmail = row.surface !== 'outlook', meta = { noise: [] };
  const atts = []; const cids = [];
  for (let i = 0; i < (row.attachmentCount || 0); i++) atts.push(realFile(r, own, i, gmail));
  const style = row.render && row.render.style;
  if (/\[image/i.test(row.body || '') || (style === 'html' && r() < 0.5)) { const cid = 'image001.png@01DB' + Math.floor(r() * 1e8).toString(16); atts.push({ id: 'n-logo', name: 'image001.png', contentType: 'image/png', size: logU(r, 3 * K, 15 * K), isInline: true, contentId: cid, kind: 'file' }); cids.push(cid); meta.noise.push('inline-logo'); }
  if (!gmail && (style === 'email' || style === 'html') && r() < 0.12) { atts.push({ id: 'n-logo2', name: 'image002.png', contentType: 'image/png', size: logU(r, 4 * K, 12 * K), isInline: false, contentId: null, kind: 'file' }); meta.noise.push('noninline-logo'); }
  if (/meeting|calendar_hold|event/.test(row.scenario || '') && r() < 0.35) { atts.push({ id: 'n-ics', name: 'invite.ics', contentType: 'text/calendar', size: logU(r, 2 * K, 6 * K), isInline: false, contentId: null, kind: 'file' }); meta.noise.push('ics'); }
  if (r() < 0.02) { atts.push({ id: 'n-smime', name: 'smime.p7s', contentType: 'application/pkcs7-signature', size: 5 * K, isInline: false, contentId: null, kind: 'file' }); meta.noise.push('smime'); }
  if (!gmail && r() < 0.015) { atts.push({ id: 'n-tnef', name: 'winmail.dat', contentType: 'application/ms-tnef', size: logU(r, 10 * K, 200 * K), isInline: false, contentId: null, kind: 'file' }); meta.noise.push('winmail'); }
  if ((/^\s*(?:fw|fwd)\s*:/i.test(row.subject || '') || row.scenario === 'quoted_forward') && r() < 0.4) { atts.push({ id: 'n-item', name: 'RE: thread.msg', contentType: null, size: logU(r, 20 * K, 300 * K), isInline: false, contentId: null, kind: gmail ? 'item' : 'item' }); meta.noise.push('item'); }
  if (!gmail && r() < 0.03) { atts.push({ id: 'n-ref', name: 'Shared.xlsx', contentType: null, size: 0, isInline: false, contentId: null, kind: 'reference' }); meta.noise.push('reference'); }
  const mk = row.scenario === 'marketing';
  const headers = { listUnsubscribe: mk && r() < 0.85 ? '<mailto:unsubscribe@news.example.com>' : (r() < 0.01 ? '<https://lists.example.com/u>' : null), precedence: mk && r() < 0.05 ? 'bulk' : null };
  const inbound = (row.direction || 'inbound') === 'inbound';
  let uploadLimitBytes = null;
  if (atts.some((a) => a.kind === 'file' && !a.isInline) && r() < 0.02) { uploadLimitBytes = 4 * MB; const f = atts.find((a) => a.id === 'f0'); if (f) f.size = logU(r, 6 * MB, 40 * MB); meta.noise.push('limit'); }
  return { atts, cids, headers, meta, uploadLimitBytes, attachmentsRead: gmail ? true : r() >= 0.02, consent: r() >= 0.06, senderIsUser: !inbound, savedRoll: r(), dismissRoll: r() };
}
const all = fs.readFileSync(path.join(M, 'dataset', 'out-v2', 'all.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const withAtt = all.filter((r) => (r.attachmentCount || 0) >= 1);
const noAtt = all.filter((r) => !(r.attachmentCount || 0)).map((r) => [T.fnv1a('pick:' + r.id), r]).sort((a, b) => a[0] - b[0]).slice(0, 3000).map((x) => x[1]);
const out = []; const sum = { rows: 0, byTarget: {}, byReason: {}, bySurface: {}, byLang: {}, bySplit: {}, trapsHasAttachmentsNoRealFile: 0, trapsQuiet: 0, explicitConverted: 0, newExplicitCards: 0, suggestOnRefShow: 0, attCount: {} };
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
for (const row of withAtt.concat(noAtt)) {
  const n = T.normalizeInput(row); const c = T.normalizeCase(Object.assign({ ownNames: row.ownNames }, n));
  const own = P.preprocess(core, c, { now: NOW }).own;
  const L = layer(row, own);
  const refLab = row.reference.label, step = refLab !== 'SILENT' ? refLab.split('|')[1] : null;
  const input = { surface: row.surface, direction: row.direction || 'inbound', senderIsUser: L.senderIsUser, isDraft: false, inSent: L.senderIsUser, consent: L.consent,
    attachmentsRead: L.attachmentsRead, attachments: L.attachmentsRead ? L.atts : null, bodyCids: L.cids, headers: L.headers, text: own, subject: n.subject || '',
    judgment: { reason: row.engine35 ? row.engine35.reason : null, explicit: step ? { step } : null, marketing: false }, messageId: row.id, savedFileIds: [], dismissed: [], uploadLimitBytes: L.uploadLimitBytes };
  let o = S.decide(input);
  if (o.suggest && L.savedRoll < 0.02) { input.savedFileIds = o.files.map((f) => f.id); o = S.decide(input); }
  else if (o.suggest && L.dismissRoll < 0.02) { input.dismissed = [row.id]; o = S.decide(input); }
  const target = o.suggest ? 'suggest-save' : refLab;
  if (o.suggest && refLab !== 'SILENT') sum.suggestOnRefShow++;
  if (o.mode === 'explicit-multi') sum.explicitConverted++;
  const parts = L.attachmentsRead ? L.atts.length : null, real = (row.attachmentCount || 0);
  if (parts && !real) { sum.trapsHasAttachmentsNoRealFile++; if (!o.suggest) sum.trapsQuiet++; }
  out.push({ id: 'ss-' + row.id, srcId: row.id, provenance: 'v2:' + row.provenance + '+attach-meta-v22', split: row.split, lang: row.lang, scenario: row.scenario, surface: row.surface, direction: row.direction || 'inbound',
    attachmentCount: real, hasAttachmentsFlag: (L.atts.length > 0), noise: L.meta.noise, referenceLabel: refLab, unsure: Boolean(row.reference.unsure), target, suggestReason: o.reason, suggestMode: o.mode || null,
    chipCount: o.chip ? o.chip.count : 0, input, out: o });
  inc(sum.byTarget, target === 'suggest-save' ? 'suggest-save' : (target === 'SILENT' ? 'SILENT' : 'explicit-card')); inc(sum.byReason, o.reason); inc(sum.attCount, real + ':' + (o.suggest ? 'suggest' : 'quiet'));
  inc(sum.bySurface, row.surface + ':' + (o.suggest ? 'suggest' : 'quiet')); inc(sum.byLang, row.lang + ':' + (o.suggest ? 'suggest' : 'quiet')); inc(sum.bySplit, row.split + ':' + (o.suggest ? 'suggest' : 'quiet'));
}
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus-22.json'), 'utf8'));
for (const cse of corpus) { const o = S.decide(cse.input); out.push({ id: 'ss-spec-' + cse.row + (cse.variant ? '-' + cse.variant : ''), provenance: 'spec-suggest-save', split: 'spec', lang: /[\u05D0-\u05EA]/.test(cse.input.text) ? 'he' : 'en', surface: cse.input.surface, direction: cse.input.direction,
  referenceLabel: cse.input.judgment.explicit ? 'explicit:' + cse.input.judgment.explicit.step : 'SILENT', target: o.suggest ? 'suggest-save' : (cse.input.judgment.explicit ? 'explicit:' + cse.input.judgment.explicit.step : 'SILENT'), suggestReason: o.reason, suggestMode: o.mode || null, chipCount: o.chip ? o.chip.count : 0, input: cse.input, out: o, expect: cse.expect }); }
sum.rows = out.length; sum.specRows = corpus.length;
sum.newExplicitCards = out.filter((x) => x.target !== 'suggest-save' && x.target !== x.referenceLabel).length;
sum.note = 'attachment metadata is SYNTHESIZED (seeded) over real dataset rows; it tests the rule and gives a training target, it is not evidence of real-traffic rates';
fs.writeFileSync(path.join(OUT, 'suggest-save.jsonl'), out.map((x) => JSON.stringify(x)).join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'suggest-save.summary.json'), JSON.stringify(sum, null, 1));
console.log(JSON.stringify(sum, null, 1));
