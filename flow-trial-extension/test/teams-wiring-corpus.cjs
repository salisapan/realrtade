// The Teams meeting link on the live Outlook Hold It path, behind the owner's switch
// TEAMS_MEETING (off). Checks: Microsoft's join block never reads as a person's edit
// (so Undo does not refuse a fresh event, and still refuses a real edit); the light call
// check; the service worker adds a link only when the switch is on and the mail asks for
// a call, reads the link back by id, and withdraws the event when no link shows.
// Run: node test/teams-wiring-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowNativeEdit: N } = require('../src/native-edit.js');
const { FlowTeamsMeeting: T } = require('../core/teams-meeting.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const JOIN = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d';
const BLOCK_EN = '<div>________________________________________________________________________________</div><div>Microsoft Teams meeting</div><div>Join: <a href="' + JOIN + '">Join the meeting now</a></div><div>Meeting ID: 123 456 789</div>';
const BLOCK_HE = '<div>________________________________________________________________________________</div><div>הצטרפות ל-Microsoft Teams</div><div><a href="' + JOIN + '">הצטרף לפגישה</a></div>';

console.log('\n--- the join block is not an edit ---\n');
const mk = (content) => ({ subject: 'Teams call with Dana', body: { contentType: 'html', content: content }, start: { dateTime: '2026-10-22T14:00:00.0000000' }, end: { dateTime: '2026-10-22T14:30:00.0000000' }, attendees: [] });
const before = N.snapshotOf(mk('<p>Teams call with Dana</p>'));
check('the block arrives after the snapshot: still a match (English)', N.compareContent(before, mk('<p>Teams call with Dana</p>' + BLOCK_EN)) === 'match');
check('the block arrives after the snapshot: still a match (Hebrew)', N.compareContent(before, mk('<p>Teams call with Dana</p>' + BLOCK_HE)) === 'match');
const withBlock = N.snapshotOf(mk('<p>Teams call with Dana</p>' + BLOCK_EN));
check('snapshot taken with the block, block still there: match', N.compareContent(withBlock, mk('<p>Teams call with Dana</p>' + BLOCK_EN)) === 'match');
check('the person adds an agenda above the block: an edit', N.compareContent(before, mk('<p>Teams call with Dana</p><p>Agenda: pricing</p>' + BLOCK_EN)) === 'edited');
check('the person rewrites the text: an edit', N.compareContent(withBlock, mk('<p>Different</p>' + BLOCK_EN)) === 'edited');
check('plain text with a long rule but no Teams words is the person\'s', N.compareContent(N.snapshotOf(mk('A\n________________\nB')), mk('A')) === 'edited');

console.log('\n--- the light check for a call ---\n');
const yes = ['Can we do a Teams call tomorrow at 15:00?', "Let's hop on a video call on Thursday.", 'נעשה שיחת וידאו מחר', 'Shall we schedule an online meeting on Oct 22?'];
const no = ["Let's do a video call on Zoom tomorrow.", 'Maybe a video call sometime.', 'FYI recording of the video call.', 'Ask Dana to set up a Teams call.', 'No need for a video call.', 'The Teams call is tomorrow.', 'Lunch tomorrow at 13:00?', 'בואו נעשה שיחת וידאו בזום'];
yes.forEach((t) => check('asks for a call: ' + t, T.callAsked(t) === true));
no.forEach((t) => check('not a call to hold: ' + t, T.callAsked(t) === false));
check('empty is not a call', T.callAsked('') === false && T.callAsked(null) === false);

console.log('\n--- the service worker, with stubs ---\n');
const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
function fn(name) {
  const start = bg.indexOf('async function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  let depth = 0, i = bg.indexOf('{', start);
  const from = i;
  for (; i < bg.length; i++) {
    if (bg[i] === '{') depth++;
    else if (bg[i] === '}') { depth--; if (depth === 0) break; }
  }
  return bg.slice(start, i + 1);
}
function sandbox(opts) {
  const calls = [];
  const ctx = {
    globalThis: null,
    OUTLOOK_GRAPH: 'https://graph.microsoft.com/v1.0',
    setTimeout: (f) => { f(); return 0; },
    Promise,
    chrome: { storage: { local: { get: async () => ({ glanceSwitches: opts.switches || {} }) } } },
    outlookAssertNotSend: (u) => { if (/\/send|sendMail/i.test(u)) throw new Error('send'); },
    outlookReadJson: async (res) => res.json(),
    outlookFetch: async (url, init) => {
      calls.push({ url, method: (init && init.method) || 'GET' });
      const left = opts.linkAfter == null ? 0 : opts.linkAfter;
      const n = calls.filter((c) => c.method === 'GET').length;
      const linked = opts.noLink ? false : n > left;
      const raw = { id: 'EV1', isCancelled: false, isOnlineMeeting: linked, onlineMeeting: linked ? { joinUrl: opts.link || JOIN } : null };
      return { ok: true, status: 200, json: async () => raw };
    },
    FlowTeamsMeeting: T
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fn('glanceSwitchOn') + '\n' + fn('outlookTeamsWanted') + '\n' + fn('outlookTeamsJoinUrl') + '\nthis.glanceSwitchOn = glanceSwitchOn; this.outlookTeamsWanted = outlookTeamsWanted; this.outlookTeamsJoinUrl = outlookTeamsJoinUrl;', ctx);
  return { ctx, calls };
}
(async () => {
  let s = sandbox({});
  check('switch missing: no Teams link, even for a Teams ask', (await s.ctx.outlookTeamsWanted(yes[0])) === false);
  s = sandbox({ switches: { TEAMS_MEETING: false } });
  check('switch false: no Teams link', (await s.ctx.outlookTeamsWanted(yes[0])) === false);
  s = sandbox({ switches: { TEAMS_MEETING: true } });
  check('switch on and the mail asks for a call: a Teams link', (await s.ctx.outlookTeamsWanted(yes[0])) === true);
  check('switch on but the mail names Zoom: none', (await s.ctx.outlookTeamsWanted(no[0])) === false);
  check('switch on but a plain meeting mail with no call: none', (await s.ctx.outlookTeamsWanted('Meeting tomorrow at 15:00 in room 4.')) === false);
  check('no mail text passed: none', (await s.ctx.outlookTeamsWanted('')) === false);

  s = sandbox({ switches: { TEAMS_MEETING: true }, linkAfter: 2 });
  check('a link that appears late is waited for and read by id', (await s.ctx.outlookTeamsJoinUrl('EV1')) === JOIN && s.calls.every((c) => /\/me\/events\/EV1\?\$select=/.test(c.url)), s.calls);
  s = sandbox({ switches: { TEAMS_MEETING: true }, noLink: true });
  check('no link ever: empty, so the caller withdraws the event', (await s.ctx.outlookTeamsJoinUrl('EV1')) === '' && s.calls.length === 5, s.calls.length);
  s = sandbox({ switches: { TEAMS_MEETING: true }, link: 'https://evil.example/l/meetup-join/x' });
  check('a link that is not a Teams join link is not one', (await s.ctx.outlookTeamsJoinUrl('EV1')) === '');

  console.log('\n--- the write path, read as source ---\n');
  const w = fn('outlookMeetingWrite');
  check('attendees stay empty and the refusal for invites is kept before the Teams fields', w.indexOf("reason: 'refused'") < w.indexOf('isOnlineMeeting = true'));
  check('the Teams fields are set only inside the switch check', /const teams = await outlookTeamsWanted\(params\.callText\);\s*if \(teams\) \{\s*body\.isOnlineMeeting = true;\s*body\.onlineMeetingProvider = 'teamsForBusiness';\s*\}/.test(w));
  check('no link read back: the event is deleted and no Handled is returned', /if \(!joinUrl\) \{[\s\S]*method: 'DELETE'[\s\S]*reason: 'teams-link-failed'/.test(w));
  check('the snapshot for Undo is taken after the link exists', w.indexOf('outlookTeamsJoinUrl(event.id)') < w.indexOf('outlookEventRead(event.id)'));
  check('the receipt says Teams only with a join link', /\(joinUrl \? ' · Teams' : ''\)/.test(w));
  check('switch default is off in the module', T.SWITCH_DEFAULT === false && /glanceSwitches/.test(bg));
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8');
  check('the page passes the mail text only on a meeting hold, capped', /params\.meeting === true && ctx && ctx\.bodyText\) params\.callText = String\(ctx\.bodyText\)\.slice\(0, 1500\)/.test(content));
  check('no Mail.Send is introduced', !/Mail\.Send/.test(bg.slice(bg.indexOf('async function outlookTeamsWanted'), bg.indexOf('async function outlookTeamsJoinUrl') + 1200)));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
