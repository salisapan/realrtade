// Teams host prompt: a denial unticks, shows the Hebrew line, and a later tick asks again.
// Run: node test/teams-host-consent-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowTeamsHostConsent: C } = require('../src/teams-host-consent.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

(async () => {
  const popup = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../popup/popup.html'), 'utf8');
  const bg = fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8');
  check('the privacy line places the reply in the compose box', C.PRIVACY_HE.indexOf('ומניח תשובה רק בתיבת הכתיבה') >= 0);
  check('the privacy line does not use the mistyped words', C.PRIVACY_HE.indexOf('וניתוח') < 0 && C.PRIVACY_HE.indexOf('חיבת') < 0);
  check('the popup shows that privacy line', popup.indexOf('FlowTeamsHostConsent.PRIVACY_HE') >= 0);
  check('the popup loads the consent helper', html.indexOf('src/teams-host-consent.js') >= 0);

  const calls = [];
  const box = { checked: true };
  const note = { hidden: true, textContent: '' };
  const button = { disabled: true };
  const request = async () => { calls.push('ask'); return false; };
  const first = await C.ask(request, { box: box, note: note, button: button });
  check('a denial is not a grant', first === false);
  check('a denial unticks Teams', box.checked === false);
  check('a denial shows the Hebrew line', note.hidden === false && note.textContent === C.DENIED_HE);
  check('a denial leaves the button usable', button.disabled === false);

  box.checked = true;
  button.disabled = true;
  const second = await C.ask(request, { box: box, note: note, button: button });
  check('a second tick after denial asks again', second === false && calls.length === 2 && box.checked === false);

  box.checked = true;
  const granted = await C.ask(async () => true, { box: box, note: note, button: button });
  check('an allow leaves the ticked box alone', granted === true && box.checked === true);

  const removed = [];
  box.checked = false;
  button.disabled = true;
  note.hidden = true;
  const released = await C.release(() => { removed.push(C.OFF_HE); return true; }, { box: box, note: note, button: button });
  check('untick removes the hosts', released === true && removed.length === 1);
  check('untick leaves Teams off', box.checked === false && note.hidden === false && note.textContent === C.OFF_HE);
  check('untick leaves the button usable', button.disabled === false);
  check('the off line does not use the mistyped words', C.OFF_HE.indexOf('וניתוח') < 0 && C.OFF_HE.indexOf('חיבת') < 0);

  box.checked = true;
  button.disabled = true;
  const again = await C.ask(request, { box: box, note: note, button: button });
  check('a tick after untick asks again', again === false && calls.length === 3 && box.checked === false);

  check('the popup removes Teams hosts on untick', popup.indexOf('releaseTeamsWebHosts') >= 0 && popup.indexOf('chrome.permissions.remove({ origins: teamsWebHosts() })') >= 0);
  check('select-all off removes the Teams hosts', popup.indexOf('else if (!allBox.checked && teamsWas)') >= 0 && popup.indexOf('await releaseTeamsWebHosts({ box: teamsBox, note: note, button: c })') >= 0);

  const { FlowTeamsLaneSpec: Spec } = require('../src/teams-lane-spec.js');
  const boot = fs.readFileSync(path.join(__dirname, '../src/teams-lane-boot.js'), 'utf8');
  const urls = [
    'https://teams.live.com/',
    'https://teams.live.com/v2/',
    'https://teams.live.com/v2',
    'https://teams.live.com/v2/#/l/chat/19:abc@thread.v2',
    'https://teams.live.com/v2/?culture=en-us#/l/chat/48:notes',
    'https://teams.microsoft.com/',
    'https://teams.microsoft.com/v2/',
    'https://teams.microsoft.com/v2/#/l/chat/19:abc@thread.v2'
  ];
  urls.forEach((href) => check('Teams match covers ' + href, Spec.covers(href) === true));
  check('a different host is not a Teams match', Spec.covers('https://outlook.live.com/mail/') === false);
  check('the boot script logs the injected url', boot.indexOf("[Glance] teams lane injected ") >= 0 && boot.indexOf('data-glance-lane-teams') >= 0);
  check('the registration uses every frame and does not wait for the load event',
    bg.indexOf('allFrames: true') >= 0 && bg.indexOf('matchOriginAsFallback: true') >= 0 && bg.indexOf("runAt: 'document_end'") >= 0 && bg.indexOf('src/teams-lane-boot.js') >= 0);

  if (failures) process.exit(1);
  console.log('teams-host-consent-corpus: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
