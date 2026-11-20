'use strict';
// The product's recognition UNION, as the Gmail and Outlook hosts use it: the kind-specific readers first (a reader that fires wins, as in src/content-gmail.js),
// then the shared judge with every Labs switch it takes turned on. Lab only: nothing is written. Used by run.cjs (probe) and frozen-kinds.cjs (the frozen set).
const fs = require('fs'), path = require('path'), vm = require('vm');
const { load, ROOT } = require('./load.cjs');
const L = load();
for (const f of ['workspace-file.js', 'sheet-row.js', 'onedrive-new-file.js', 'sharepoint-new-file.js', 'recurring-reminder.js', 'meet-link.js', 'teams-meeting.js', 'event-call-link.js', 'calendar-move.js', 'outlook-word.js', 'outlook-excel.js', 'google-docs.js']) {
  const p = path.join(ROOT, 'core', f); if (fs.existsSync(p)) try { vm.runInContext(fs.readFileSync(p, 'utf8'), L.sb, { filename: f }); } catch (e) { /* already declared */ }
}
const g = L.g, NOW = L.NOW;
const J = g('FlowIncomingJudge');
const DEPS = { intent: g('FlowIntent'), actions: g('FlowActions'), factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };
function familyOf(r) {
  if (!r || !r.show) return 'none';
  const kinds = (r.process && r.process.steps || []).map((s) => s.kind), id = (r.process && r.process.id) || '';
  if (/pay/i.test(id) || /pay/i.test(JSON.stringify((r.intent && r.intent.personalClose) || ''))) return 'pay';
  if (kinds.some((k) => /driveDoc/.test(k))) return 'doc_create';
  if (kinds.some((k) => /driveSheet/.test(k))) return 'sheet_create';
  if (kinds.some((k) => /onedriveNewFile|sharepointNewFile/.test(k))) return 'word_create';
  if (kinds.some((k) => /driveFile|onedriveFile|attachmentSave|sharepointSaveFile/.test(k))) return 'file_save';
  if (kinds.some((k) => /calendar|Event|Meet/i.test(k))) return 'calendar';
  if (kinds.some((k) => /Draft$/.test(k))) return 'draft';
  if (kinds.some((k) => /Task/.test(k))) return 'task';
  return 'other:' + kinds.join('+');
}
// The readers the judge does not call. Each returns a family or null. They are the product's own recognizers, called with the Labs switch assumed on.
function readers(text, surface, only) {
  const at = new Date(NOW), hits = [];
  const t = (name, fn) => { if (only && only.indexOf(name) < 0) return; try { const m = g(name); const r = m && fn(m); if (r) hits.push(r); } catch (e) { /* reader error = silent */ } };
  if (surface === 'gmail') t('FlowWorkspaceFile', (m) => { const r = m.recognize(text); return r && r.kind === 'clear' ? ({ doc: 'doc_create', sheet: 'sheet_create', slides: 'slides_create', form: 'form_create' }[r.fileKind] || 'doc_create') : null; });
  if (surface === 'gmail') t('FlowSheetRow', (m) => { const r = m.recognize(text); return r && r.kind === 'clear' ? 'sheet_row' : null; });
  t('FlowMeetLink', (m) => { const r = m.recognize(text, at); return r && r.kind === 'clear' ? 'video_link' : null; });
  t('FlowTeamsMeeting', (m) => { const r = m.recognize(text, at); return surface === 'outlook' && r && r.kind === 'clear' ? 'video_link' : null; });
  t('FlowOnedriveNewFile', (m) => { const r = m.recognize(text); return surface === 'outlook' && r && r.kind === 'clear' ? (r.fileKind === 'sheet' ? 'excel_create' : 'word_create') : null; });
  t('FlowRecurringReminder', (m) => { const r = m.recognize(text, new Date(NOW).toISOString().slice(0, 10)); return r && r.kind === 'clear' ? 'calendar' : null; });
  return hits;
}

const OWN = { gmail: 'ai.local.flow@gmail.com', outlook: 'glance.salisapan@outlook.com' };
// GLANCE_SHIPPED=1 reads the product the way it ships: every Labs switch OFF and the kind readers that sit behind a switch not called (what the person sees with no setup).
const MODE = process.env.GLANCE_SHIPPED || '';   // '' every switch on; '1' every switch off; 'wave1' the four closes the owner turned on (core/labs-seed.js) and the rest off
const SHIPPED = MODE === '1' || MODE === 'wave1' || MODE === 'wave2';
const WAVE1 = MODE === 'wave1' || MODE === 'wave2';
// wave2 = wave1 + the closes that create a new file or a video link (WORKSPACE_FILE, MEET_LINK, TEAMS_MEETING, ONEDRIVE_NEW_FILE); CALENDAR_CHANGE, recurring and the rest stay off.
const WAVE2 = MODE === 'wave2';
const WAVE2_READERS = ['FlowWorkspaceFile', 'FlowMeetLink', 'FlowTeamsMeeting', 'FlowOnedriveNewFile'];   // directAskOn is on in every mode: both content scripts and the chat card pass it true (owner-approved 2026-11-12)
function recognize(over, text) {
  const surface = over.surface || 'gmail', own = OWN[surface];
  const input = Object.assign({ text, subject: 'Subject', sender: { name: 'Dana Levi', email: 'dana@acme.io' }, now: new Date(NOW), threadUrl: 'https://x/y', hasThreadAttachment: false, attachmentCount: 0, surface,
    to: [own], cc: [], ownAddresses: [own], ownNames: ['Sali', 'Sali Sapan', 'סאלי'], userName: 'Sali', direction: 'inbound', inbound: true, namesWaitDone: true,
    systemNoticeOn: !SHIPPED || WAVE1, bookingNoticeOn: !SHIPPED || WAVE1, paymentAskOn: !SHIPPED || WAVE1, taskAskOn: !SHIPPED || WAVE1, directAskOn: true, workspaceFileOn: !SHIPPED || WAVE2, calendarChangeOn: !SHIPPED }, over);
  let r; try { r = J.judge(input, DEPS); } catch (e) { r = { show: false, reason: 'ERR ' + e.message }; }
  let got = familyOf(r), via = 'judge';
  const h = WAVE2 ? readers(text, surface, WAVE2_READERS) : (SHIPPED ? [] : readers(text, surface)); if (h.length) { got = h[0]; via = 'reader'; }
  return { family: got, via, reason: r && r.show ? '' : (r && r.reason) || '', result: r };
}
module.exports = { recognize, familyOf, readers, NOW, OWN, g };
