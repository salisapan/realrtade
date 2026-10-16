'use strict';
// Gmail and Outlook execute one plan. The same text through both lanes
// must come back as the same process. A weekday that contradicts the
// calendar day is two choices and no booked day. Do it stays off until a tap.
// Run: node test/lane-plan-parity-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'incoming-judge.js']) {
  const p = path.join(ROOT, 'core', f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
}
const kit = { module: { exports: {} }, console };
vm.createContext(kit);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'step-kit.js'), 'utf8'), kit, { filename: 'step-kit.js' });
const FlowStepKit = kit.FlowStepKit;

const fix = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'parity-148-dates.json'), 'utf8'));

function shape(process) {
  if (!process) return null;
  const kind = (k) => String(k || '')
    .replace('outlookDraft', 'draft')
    .replace('gmailDraft', 'draft')
    .replace('outlookTask', 'task')
    .replace('googleTask', 'task')
    .replace('googleTasks', 'task');
  return {
    id: process.id,
    needs: process.needsDateChoice === true,
    choices: (process.dateChoices || []).map((c) => c.iso + '|' + c.label).join(','),
    date: (process.steps || []).map((s) => (s && s.params && s.params.dateIso) || '').join(','),
    steps: (process.steps || []).map((s) => kind(s && s.kind)).join(',')
  };
}

function both(text) {
  return vm.runInContext(`
    (function () {
      const now = new Date(${fix.now.join(',')});
      const text = ${JSON.stringify(text)};
      const base = { text: text, subject: '', sender: { name: 'flow', email: 'flow@example.com' }, now: now, inbound: true };
      const g = FlowIncomingJudge.judge(Object.assign({ surface: 'gmail' }, base));
      const o = FlowIncomingJudge.judge(Object.assign({ surface: 'outlook' }, base));
      const intent = FlowIntent.classify(text, { now: now, senderName: 'flow' });
      return { g: g, o: o, intent: intent };
    })()
  `, sandbox);
}

for (const row of fix.conflicts) {
  const got = both(row.text);
  const g = shape(got.g && got.g.process);
  const o = shape(got.o && got.o.process);
  check(row.id + ': both lanes offer the same unchosen hold',
    got.g && got.g.show === true && got.o && got.o.show === true &&
    g && o && g.id === 'hold' && o.id === 'hold' && g.needs === true && o.needs === true &&
    g.choices === o.choices && g.date === '' && o.date === '' &&
    g.steps === 'calendar' && o.steps === 'calendar' &&
    (got.intent.entities.dateIso == null),
    { g: g, o: o, show: [got.g && got.g.show, got.o && got.o.show], reason: [got.g && got.g.reason, got.o && got.o.reason] });
  const labels = (got.g.process.dateChoices || []).map((c) => c.label);
  check(row.id + ': both dates, no default',
    labels.length === 2 && row.labels.every((label) => labels.indexOf(label) >= 0) &&
    labels.indexOf(row.labels[0]) === 0,
    labels);
  const picked = got.g.process.dateChoices[1].iso;
  const chosen = vm.runInContext('FlowActions.chooseDate', sandbox)(got.g.process, picked);
  const rejected = vm.runInContext('FlowActions.chooseDate', sandbox)(got.o.process, '2026-10-15');
  check(row.id + ': a tap picks one offered date and a third date is refused',
    chosen === true && got.g.process.needsDateChoice === false &&
    got.g.process.steps[0].params.dateIso === picked && rejected === false,
    { chosen: chosen, iso: got.g.process.steps[0].params.dateIso, rejected: rejected });
}

const team = both(fix.team.text);
const teamG = shape(team.g && team.g.process);
const teamO = shape(team.o && team.o.process);
check('team meeting is the same hold on both lanes',
  team.g && team.g.show === true && team.o && team.o.show === true &&
  teamG && teamO && teamG.id === 'hold' && teamO.id === 'hold' &&
  teamG.needs === false && teamO.needs === false &&
  teamG.steps === 'calendar' && teamO.steps === 'calendar' &&
  team.intent.entities.dateIso === fix.team.iso && team.intent.entities.hour === 14,
  { teamG: teamG, teamO: teamO, reason: [team.g && team.g.reason, team.o && team.o.reason], iso: team.intent && team.intent.entities });

for (const row of fix.plans) {
  const got = both(row.text);
  const g = shape(got.g && got.g.process);
  const o = shape(got.o && got.o.process);
  check('plan parity: ' + row.text,
    got.g && got.g.show === true && got.o && got.o.show === true &&
    g && o && JSON.stringify(g) === JSON.stringify(o) && g.id === row.id,
    { g: g, o: o, show: [got.g && got.g.reason, got.o && got.o.reason] });
}

for (const text of fix.replies) {
  const got = both(text);
  const g = shape(got.g && got.g.process);
  const o = shape(got.o && got.o.process);
  check('reply keeps Reply & Track with no due date: ' + text.slice(0, 24),
    got.intent && got.intent.type === 'request' &&
    got.intent.entities && got.intent.entities.dateIso == null &&
    g && o && g.id === 'reply-track' && o.id === 'reply-track' && g.id === o.id &&
    got.g.show === true && got.o.show === true,
    { type: got.intent && got.intent.type, date: got.intent && got.intent.entities && got.intent.entities.dateIso, g: g, o: o, reason: [got.g && got.g.reason, got.o && got.o.reason] });
}

const html = FlowStepKit.stageHTML({
  intent: 'Meeting',
  uiLang: 'he',
  he: true,
  rows: [],
  chip: {
    mode: 'count',
    needsDateChoice: true,
    dateChoices: [
      { iso: '2026-10-21', label: 'רביעי 21/10' },
      { iso: '2026-10-22', label: 'חמישי 22/10' }
    ]
  }
});
check('the card offers both dates and Do it is disabled until a tap',
  html.indexOf('רביעי 21/10') >= 0 && html.indexOf('חמישי 22/10') >= 0 &&
  html.indexOf('aria-pressed="true"') < 0 && /class="do-halo[^"]*" [^>]*disabled/.test(html),
  html.slice(html.indexOf('chip-dates'), html.indexOf('chip-dates') + 400));

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
