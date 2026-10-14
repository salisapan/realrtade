// The lane card is triggered from the Outlook card by glance:outlook-card.
// content-outlook.js stays untouched; the one hook line lives in a patch
// for after the open Outlook edit merges.
// Run: node test/outlook-lane-caller-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const root = path.join(__dirname, '..');
const outlook = fs.readFileSync(path.join(root, 'src/content-outlook.js'), 'utf8');
const lane = fs.readFileSync(path.join(root, 'src/content-outlook-lane-ms.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/lane-ms-page.js'), 'utf8');
const patch = fs.readFileSync(path.join(root, 'src/content-outlook.lane-ms.patch'), 'utf8');
const launch = fs.readFileSync(path.join(root, 'e2e/support/launch.js'), 'utf8');
const mock = fs.readFileSync(path.join(root, 'e2e/support/lane-ms-mock.js'), 'utf8');

check('content-outlook.js has no lane hook', outlook.indexOf('glance:outlook-card') < 0 && outlook.indexOf('lane-ms') < 0 && outlook.indexOf('FlowLaneMs') < 0);
check('the lane script listens for the card event', lane.indexOf("const EVENT = 'glance:outlook-card'") > 0 && lane.indexOf('document.addEventListener(EVENT, onCard, true)') > 0);
check('the lane script dispatches that event on the existing card', lane.indexOf('host.dispatchEvent(new CustomEvent(EVENT, { bubbles: true }))') > 0);
check('the page starts only when the card attaches it', page.indexOf('FlowLaneMsPage = { attach: attach }') > 0 && page.indexOf('DOMContentLoaded') < 0);
check('the patch is the one hook line for after the Outlook edit merges', patch.indexOf("host.dispatchEvent(new CustomEvent('glance:outlook-card', { bubbles: true }))") > 0 && patch.split('\n').filter((line) => line.indexOf('+') === 0 && line.indexOf('+++') !== 0).length === 1);
check('launch.js is not the lane mock', launch.indexOf('lane-ms') < 0 && launch.indexOf('/me/contacts') < 0 && launch.indexOf('sendMail') < 0);
check('the lane mock owns the Graph routes and the card injection', mock.indexOf('function installLaneMock') > 0 && mock.indexOf('content-outlook-lane-ms.js') > 0 && mock.indexOf('executeScript') > 0);

if (failures) process.exit(1);
console.log('outlook-lane-caller-corpus: all passed');
