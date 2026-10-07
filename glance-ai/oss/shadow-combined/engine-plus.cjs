'use strict';
// Engine 0.9.35 wrapper for the combined shadow: the v2 pipeline's prepare() (engine label + base/product/cap vetoes, read-only
// require from model/runtime) plus the ENGINE's own date (FlowExtract on the quote-stripped own text) and engine card title/due
// (from FlowIncomingJudge intent entities). Dates in the combined system always come from here, never from the LLM.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { engineRoot, ROOT: AI } = require('../../paths.cjs');
const MODEL = path.join(AI, 'model');
const { prepare } = require(path.join(MODEL, 'runtime/pipeline-v2.cjs'));
const ROOT = engineRoot();
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'file-attach.js', 'fact-reply.js', 'quiet-metrics.js', 'resolution.js', 'commitment-title.js', 'graph-mail.js', 'incoming-judge.js', 'outlook-calendar.js', 'draft-reply.js'];
const sb = { module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, exports: {}, TextEncoder, atob, btoa };
sb.globalThis = sb; vm.createContext(sb);
for (const f of FILES) { const p = path.join(ROOT, 'core', f); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sb, { filename: f }); }
const g = (n) => { try { return vm.runInContext('typeof ' + n + ' !== "undefined" ? ' + n + ' : null', sb); } catch (e) { return null; } };
const FX = g('FlowExtract'), CT = g('FlowCommitmentTitle'), J = g('FlowIncomingJudge'), FI = g('FlowIntent'), FA = g('FlowActions');
const DEPS = { intent: FI, actions: FA, factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };
const NOW = new Date('2026-10-07T12:00:00+03:00'), TODAY = '2026-10-07';
function engineDate(own, c) { try { const f = FX.extract(own, { senderEmail: (c.from || {}).email || null, now: NOW }) || {}; return (f.date && f.date.iso) || null; } catch (e) { return null; } }
function engineCard(own, c) {
  // title/due for an engine card: judge intent entities (same call shape as the v2 engine wrapper, Gmail surface)
  try {
    const r = J.judge({ text: own, subject: c.subject || '', sender: { name: (c.from || {}).name || null, email: (c.from || {}).email || null }, now: NOW, threadUrl: 'https://mail.google.com/x',
      hasThreadAttachment: (c.attachmentCount || 0) >= 1, attachmentCount: c.attachmentCount || 0, surface: c.surface === 'outlook' ? 'outlook' : 'gmail' }, DEPS);
    const ent = (r && r.intent && r.intent.entities) || {};
    const st = (r && r.process && r.process.steps) || []; const pr = (st[0] && st[0].params) || {};
    let title = (CT && CT.titleFromBody && CT.titleFromBody(own)) || pr.title || pr.summary || (r && r.intent && r.intent.label) || null;
    return { dateIso: ent.dateIso || null, title };
  } catch (e) { return { dateIso: null, title: null }; }
}
function analyze(c) {
  const P = prepare(c);
  const d1 = engineDate(P.own, P.c), ec = engineCard(P.own, P.c);
  return { P, eng: { dateIso: ec.dateIso || d1 || null, extractIso: d1, title: ec.title, today: TODAY } };
}
module.exports = { analyze, TODAY };
if (require.main === module) {
  for (const b of ["Hi Sali,\nLet's meet on October 14 at 3pm to go over the budget.\nDavid", 'אשלח לך את הצעת המחיר עד יום ראשון.', 'The call on October 1 at 2pm went well.', 'Can you approve the budget by Friday?'])
    { const a = analyze({ body: b, subject: 'x', direction: 'inbound', surface: 'gmail', from: { name: 'D', email: 'd@x.io' }, to: ['ai.local.flow@gmail.com'], cc: [], attachmentCount: 0 }); console.log(a.P.eng.label, a.P.eng.reason, JSON.stringify(a.eng), a.P.veto.base, a.P.veto.product); }
}
