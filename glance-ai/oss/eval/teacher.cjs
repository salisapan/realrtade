// Teacher wrapper: runs the deterministic Glance 0.9.34 engine (core/*.js) on one case.
// Read-only use of the in-repo extension tip (or GLANCE_ENGINE_ROOT). No network.
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const CORE = path.join(require('../../paths.cjs').engineRoot(), 'core');
const FILES = ['domains.js','extract.js','judgment.js','google-closes.js','close-families.js','intent.js','actions.js',
  'source-text.js','request-types.js','file-attach.js','resolution.js','fact-reply.js','quiet-metrics.js','commitment-title.js',
  'draft-reply.js','follow-up.js','onedrive-file.js','incoming-judge.js'];
const sandbox = { module: undefined, console: { log(){}, warn(){}, error(){} }, require: undefined };
vm.createContext(sandbox);
const loaded = [];
for (const f of FILES) {
  try { vm.runInContext(fs.readFileSync(path.join(CORE, f), 'utf8'), sandbox, { filename: f }); loaded.push(f); }
  catch (e) { process.stderr.write('load fail ' + f + ': ' + e.message + '\n'); }
}
const get = (n) => { try { return vm.runInContext(n, sandbox); } catch (e) { return null; } };
const J = get('FlowIncomingJudge'), CT = get('FlowCommitmentTitle'), CF = get('FlowCloseFamilies');
module.exports = { judge, loaded, J, CT, CF, get };

function judge(c, nowIso) {
  const now = new Date(nowIso || '2026-10-07T09:00:00Z');
  // Host rule (content scripts only judge incoming mail): own/outbound mail is never judged.
  if (c.direction === 'outbound') return { decision: 'silence', reason: 'host:outbound' };
  let r;
  try {
    r = J.judge({ text: c.body, subject: c.subject || '', sender: { email: c.from || 'dana@meridian.com', name: c.fromName || null },
      attachmentCount: c.attachments ? c.attachments.length : 0, hasThreadAttachment: !!(c.attachments && c.attachments.length),
      now, surface: c.surface || 'gmail', threadUrl: 'https://mail.example/t/1' });
  } catch (e) { return { decision: 'silence', reason: 'teacher-error:' + e.message }; }
  if (!r || !r.show) return { decision: 'silence', reason: r && r.reason, intentType: r && r.intent && r.intent.type, closeFamily: r && r.intent && r.intent.closeFamily };
  const p = r.process || {}; const steps = (p.steps || []);
  const kinds = steps.map(s => s.kind);
  let action = 'other';
  if (kinds.some(k => /Draft/.test(k))) action = 'draft_reply';
  else if (kinds.includes('calendar')) action = 'calendar_event';
  else if (kinds.some(k => /Task/.test(k))) action = 'create_task';
  else if (kinds.some(k => /driveFile|onedriveFile/.test(k))) action = 'save_file';
  const anchor = (get('FlowActions').PROCESS_CATALOG[p.id] || {}).anchor || null;
  const family = { calendar: 'calendar', task: 'task', draft: 'reply', file: 'file', doc: 'doc' }[anchor] || 'other';
  const ent = (r.intent && r.intent.entities) || {};
  const first = steps[0] || {}; const pr = first.params || {};
  let title = null;
  if (family === 'task') title = (CT && CT.titleFromBody(c.body)) || r.intent.label || null;
  else title = pr.title || pr.summary || r.intent.label || null;
  const due = ent.dateIso || null;
  return { decision: 'act', family, action: p.id, title, due, processId: p.id, kinds, title, due, intentType: r.intent && r.intent.type, closeFamily: r.intent && r.intent.closeFamily, confidence: r.intent && r.intent.confidence };
}
if (require.main === module) {
  console.log('loaded', loaded.length, '/', FILES.length);
  const t = [
    { body: 'Hi Sali, can you send me the signed contract by Thursday? Thanks, Dana', subject: 'Contract' },
    { body: "Let's do a call Friday, October 9 at 3pm to review the contract.", subject: 'call' },
    { body: 'I will send you the deck by Tuesday.', subject: 'deck', from: 'dana@meridian.com' },
    { body: 'אשלח לך את החוזה עד שלישי', subject: 'חוזה' },
    { body: 'Please save the attached invoice to OneDrive.', subject: 'invoice', attachments: ['invoice.pdf'], surface: 'outlook' },
    { body: "Please don't save the attachment to Drive.", subject: 'x', attachments: ['a.pdf'] },
    { body: 'FYI attached is the newsletter for October.', subject: 'newsletter', attachments: ['n.pdf'] },
  ];
  for (const c of t) console.log(JSON.stringify(judge(c)));
}
