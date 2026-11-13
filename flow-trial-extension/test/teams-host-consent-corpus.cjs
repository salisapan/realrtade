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

  if (failures) process.exit(1);
  console.log('teams-host-consent-corpus: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
