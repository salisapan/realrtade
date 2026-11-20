// Teams web lane wiring: content script, worker read, no manifest edits in this PR.
// Run: node test/teams-web-wiring-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : ''); }
}

const root = path.join(__dirname, '..');
const bg = fs.readFileSync(path.join(root, 'src/background.js'), 'utf8');
const content = fs.readFileSync(path.join(root, 'src/content-teams.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'src/lane-teams-worker.js'), 'utf8');

check('background registers the Teams lane', /glance-lane-teams/.test(bg) && /teams\.microsoft\.com/.test(bg) && /content-teams\.js/.test(bg) && /teams-lane-boot\.js/.test(bg) && /allFrames: true/.test(bg));
check('background loads teams-web-read and lane-teams-worker', /teams-web-read\.js/.test(bg) && /lane-teams-worker\.js/.test(bg));
check('content-teams never clicks send', !/\.click\s*\(/.test(content) && !/requestSubmit/.test(content));
check('worker handles flow:teams-web-read', /flow:teams-web-read/.test(worker));
check('content asks the worker for Graph read only', /flow:teams-web-read/.test(content) && !/fetch\s*\(\s*['\"]https:\/\/graph/.test(content));
check('content identifies the open chat from the frame, its parent, and the window title', /bestHref/.test(content) && /titleFromDocument/.test(content) && /chat-not-identified/.test(content) && /missingSignals/.test(content));
check('a miss is logged for the service worker as teams why-not', /\[Glance\] teams why-not /.test(content) && /flow:teams-trace/.test(content) && /\[Glance\] teams probe /.test(content) && /no-messages/.test(content));
check('the service worker records teams traces', /flow:teams-trace/.test(bg) && /__glanceTeamsLines/.test(bg) && /host-not-granted/.test(bg));
check('the Teams lane offers a card without the Labs chat switch', /channel === 'teams'/.test(fs.readFileSync(path.join(root, 'src/chat-task-card.js'), 'utf8')) && /msg.channel === 'teams'/.test(bg));
check('a Teams task uses Google Tasks without a Microsoft token or a mailbox name', /teamsLane && tasksAuth/.test(bg) && /outlookAuth/.test(bg.slice(bg.indexOf('async function chatTaskTarget'), bg.indexOf('async function chatTaskTarget') + 1800)));
check('content names an unidentified sender and never posts', /sender-not-identified/.test(content) && !/\bPOST\b/.test(content));
check('Connect files untouched in this lane', !fs.existsSync(path.join(root, 'src/outlook-connect.js')) || bg.indexOf('teams.microsoft.com') >= 0);

if (failures) process.exit(1);
console.log('teams-web-wiring-corpus: all passed');
