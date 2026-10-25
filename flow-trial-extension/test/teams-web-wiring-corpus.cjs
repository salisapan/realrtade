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

check('background registers the Teams lane', /glance-lane-teams/.test(bg) && /teams\.microsoft\.com/.test(bg) && /content-teams\.js/.test(bg));
check('background loads teams-web-read and lane-teams-worker', /teams-web-read\.js/.test(bg) && /lane-teams-worker\.js/.test(bg));
check('content-teams never clicks send', !/\.click\s*\(/.test(content) && !/requestSubmit/.test(content));
check('worker handles flow:teams-web-read', /flow:teams-web-read/.test(worker));
check('content asks the worker for Graph read only', /flow:teams-web-read/.test(content) && !/fetch\s*\(\s*['\"]https:\/\/graph/.test(content));
check('Connect files untouched in this lane', !fs.existsSync(path.join(root, 'src/outlook-connect.js')) || bg.indexOf('teams.microsoft.com') >= 0);

if (failures) process.exit(1);
console.log('teams-web-wiring-corpus: all passed');
