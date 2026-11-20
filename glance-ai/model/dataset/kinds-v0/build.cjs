'use strict';
// kinds-v0 assembly (lab only). Reads labeled-{probe,full,topup}.jsonl (generator intent + blind teacher label), then:
//  1. drops exact-duplicate texts and any text that also appears in a held-out set (frozen-eval, kind-frozen-v0, labelling batches, sealed batch) -> contamination guard
//  2. keeps rows where teacher == generator-intended kind (teacher-disagree.jsonl keeps the others, never trained on)
//  3. runs the product's recognition union (scoreboard/capabilities/union.cjs; chat-shaped rows also the chat readers) and records the engine's family next to the label.
//     The engine NEVER overwrites a label: engine-disagree.jsonl lists kept rows where the engine is silent or offers another family, which is the training signal.
//  4. exports features (model/train/featurize-v2.cjs through runtime/pipeline-v2.cjs, the same preparation as the shipped pool) to <featOut>.
// usage: node build.cjs <featOut.jsonl>
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const G = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const { recognize } = require(path.join(G, 'scoreboard', 'capabilities', 'union.cjs'));
const { load, ROOT } = require(path.join(G, 'scoreboard', 'capabilities', 'load.cjs'));
const { prepare } = require(path.join(G, 'model', 'runtime', 'pipeline-v2.cjs'));
// chat recognition, as scoreboard/capabilities/chat-run.cjs runs it (kept here because that file does not export it)
const L = load(), g = L.g;
for (const f of ['teams-meeting.js', 'meet-link.js']) try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), L.sb, { filename: f }); } catch (e) { /* already declared */ }
const J = g('FlowIncomingJudge'), at = new Date(L.NOW);
const D = { intent: g('FlowIntent'), actions: g('FlowActions'), factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };
const READERS = [['ChatAppointmentNotice', 'calendar'], ['ChatDeliveryWindow', 'calendar'], ['ChatTravelNotice', 'calendar'], ['ChatInvitationNotice', 'calendar'], ['ChatPickupNotice', 'calendar'],
  ['ChatPaymentAsk', 'pay'], ['ChatReminder', 'task'], ['ChatDeadlineAsk', 'task'], ['ChatCallbackAsk', 'task'], ['TeamsMeeting', 'video_link'], ['MeetLink', 'video_link']];
function chatFam(r) {
  if (!r || !r.show) return 'none';
  const k = (r.process && r.process.steps || []).map((s) => s.kind);
  if (/pay/i.test(JSON.stringify((r.intent && r.intent.personalClose) || ''))) return 'pay';
  if (k.some((x) => /calendar|Event/i.test(x))) return 'calendar'; if (k.some((x) => /Draft$/.test(x))) return 'draft'; if (k.some((x) => /Task/.test(x))) return 'task';
  return 'other';
}
function engineChat(text) {
  let r; try { r = J.judge({ text, subject: '', sender: { name: 'Dana', email: '' }, surface: 'chat', now: at, attachmentCount: 0, directAskOn: true, oneToOne: true, taskAskOn: true, paymentAskOn: true, bookingNoticeOn: true, namesWaitDone: true, systemNoticeOn: true, ownNames: ['Sali', 'סאלי'], userName: 'Sali', direction: 'inbound', inbound: true }, D); } catch (e) { r = null; }
  let fam = chatFam(r);
  for (const [n, f] of READERS) { const m = g('Flow' + n); if (!m || !m.recognize) continue; let x; try { x = m.recognize(text, at); } catch (e) { x = null; } if (x && x.kind && !/^(ignore|block|none)$/.test(x.kind) && (fam === 'none' || n === 'ChatPaymentAsk')) { fam = f; break; } }
  return fam;
}
const WANT = { cal_hold: 'calendar', cal_booking: 'calendar', cal_recurring: 'calendar', cal_move: 'calendar', cal_cancel: 'calendar', video_link: 'video_link', draft_reply: 'draft', task: 'task', commit_sender: 'task', commit_reader: 'task', notice_system: 'task', pay: 'pay', file_save: 'file_save', doc_create: 'doc_create', sheet_create: 'sheet_create', slides_create: 'slides_create', form_create: 'form_create', word_create: 'word_create', excel_create: 'excel_create', sheet_row: 'sheet_row', doc_append: 'doc_append' };
const SAME = { video_link: ['calendar'], slides_create: ['doc_create'], excel_create: ['word_create', 'sheet_create'], word_create: ['doc_create'], sheet_row: ['task'], pay: ['task'], draft: ['task'], task: ['draft'] };
const compat = (want, fam) => (want === 'none' ? fam === 'none' : fam !== 'none' && (fam === want || (SAME[want] || []).indexOf(fam) >= 0));
// held-out texts (contamination guard)
const held = new Set();
for (const r of read(path.join(G, 'labeling', 'frozen-eval.jsonl'))) held.add(norm(r.body));
for (const r of require(path.join(G, 'labeling', 'kind-frozen', 'kind-frozen-v0.cjs'))) held.add(norm(r[2]));
for (const f of fs.readdirSync(path.join(G, 'labeling'))) if (/^batch-\d+\.json$/.test(f)) for (const r of JSON.parse(fs.readFileSync(path.join(G, 'labeling', f), 'utf8'))) held.add(norm(r.body));
const sealed = path.join(G, 'labeling', 'sealed'); // the sealed batch is hashed, never read for text here
const src = []; for (const st of ['probe', 'full', 'topup']) src.push(...read(path.join(__dirname, `labeled-${st}.jsonl`)));
const seen = new Set(), kept = [], tdis = [], stats = { in: src.length, dup: 0, heldOut: 0, teacherDisagree: 0, unlabeled: 0 };
for (const r of src) {
  const t = norm(r.text); if (seen.has(t)) { stats.dup++; continue; } seen.add(t);
  if (held.has(t) || held.has(norm(r.subject + '\n' + r.text))) { stats.heldOut++; continue; }
  if (!r.teacher) { stats.unlabeled++; continue; }
  if (r.teacher !== r.intended) { stats.teacherDisagree++; tdis.push(r); continue; }
  kept.push(r);
}
const ATT = /attach|מצורף|מצורפת|מצורפים|מצ"ב|\.pdf|\.docx|\.xlsx/i;
const out = [], eDis = [], fo = fs.openSync(process.argv[2], 'w'); const engCount = {};
const sha = (s) => parseInt(crypto.createHash('sha256').update(s).digest('hex').slice(0, 8), 16);
for (const r of kept) {
  const surface = /^(word_create|excel_create)$/.test(r.forKind) ? 'outlook' : (/^(task|draft_reply|pay|file_save|cal_hold)$/.test(r.forKind) && sha(r.id) % 4 === 0 ? 'outlook' : 'gmail');
  const att = ATT.test(r.text) || r.forKind === 'file_save' && r.pol === 'pos' ? 1 : 0;
  const body = (r.subject ? '' : '') + r.text;
  const own = surface === 'outlook' ? 'glance.salisapan@outlook.com' : 'ai.local.flow@gmail.com';
  const c = { id: r.id, surface, direction: 'inbound', from: { name: 'Dana Levi', email: 'dana@acme.io' }, to: [own], cc: [], subject: r.subject || '', body, cleanBody: body, attachmentCount: att, lang: r.lang, ownNames: ['Sali', 'Sali Sapan', 'סאלי'] };
  let eng;
  if (r.shape === 'chat') eng = engineChat(r.text);
  else eng = recognize({ surface, subject: r.subject || 'Subject', hasThreadAttachment: att > 0, attachmentCount: att }, r.text).family;
  const want = r.intended === 'none' ? 'none' : WANT[r.intended];
  const ok = compat(want, eng); engCount[r.intended + (ok ? ':agree' : ':disagree')] = (engCount[r.intended + (ok ? ':agree' : ':disagree')] || 0) + 1;
  const rec = Object.assign({}, r, { teacherKind: r.teacher, engine: eng, engineAgrees: ok, surface, attachmentCount: att, split: sha('split:' + r.id) % 100 < 80 ? 'train' : 'val' });
  out.push(rec);
  if (!ok) eDis.push(Object.assign({}, rec, { disagreeType: r.intended === 'none' ? 'engine-offers-on-negative' : (eng === 'none' ? 'engine-silent' : 'engine-wrong-family') }));
  let P; try { P = prepare(c); } catch (e) { continue; }
  fs.writeSync(fo, JSON.stringify({ id: r.id, x: P.x, y: r.intended, want, lang: r.lang, forKind: r.forKind, pol: r.pol, shape: r.shape, surface, vb: P.veto.base, vp: P.veto.product, vc: P.veto.cap, eng: P.eng.label, split: rec.split }) + '\n');
}
fs.closeSync(fo);
const w = (n, rows) => fs.writeFileSync(path.join(__dirname, n), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
w('rows.jsonl', out); w('teacher-disagree.jsonl', tdis); w('engine-disagree.jsonl', eDis);
const byKind = {}; for (const r of out) { const k = r.forKind + ':' + r.pol; byKind[k] = (byKind[k] || 0) + 1; }
const summary = { stats, kept: out.length, teacherDisagree: tdis.length, engineDisagree: eDis.length, engineByIntended: engCount, byKind };
fs.writeFileSync(path.join(__dirname, 'summary.json'), JSON.stringify(summary, null, 1) + '\n'); console.log(JSON.stringify(Object.assign({}, summary, { byKind: undefined, engineByIntended: undefined })));
