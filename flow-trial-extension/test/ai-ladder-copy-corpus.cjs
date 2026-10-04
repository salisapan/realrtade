// Promise versus reality for the deeper read ("second reading"): the switch, the consent, and every page that says what leaves the device.
// If the switch is on, the privacy page, the trial page, the popup, the store text and the README must say what it does, with the same numbers the code enforces.
// Run: node test/ai-ladder-copy-corpus.cjs
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const { FlowAiLadder: L } = require(ROOT + '/core/ai-ladder.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const cfg = read('config', 'ladder.public.js');
const enabled = /enabled:\s*true/.test(cfg);
const privacy = read('..', 'flow-landing', 'privacy.html');
const trial = read('..', 'flow-landing', 'trial.html');
const popupHtml = read('popup', 'popup.html');
const popup = read('popup', 'popup.js');
const store = read('docs', 'chrome-web-store-submission.md');
const readme = read('README.md');
const bg = read('src', 'background.js');
const follow = read('src', 'follow.js');
const gmail = read('src', 'content-gmail.js');
const manifest = JSON.parse(read('manifest.json'));
const server = fs.readFileSync(path.join(ROOT, '..', 'flow-landing', 'netlify', 'functions', 'glance-assist', 'ladder.js'), 'utf8');
const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

check('the switch is a plain boolean in the public config', /enabled:\s*(true|false)/.test(cfg));
check('the server side is off until the owner lists the measured languages in GLANCE_AI_LADDER (nothing here can start it, "1" is not a language)', /GLANCE_AI_LADDER/.test(server) && /if \(!languages\(\)\.length\) return false;/.test(server) && /x === 'en' \|\| x === 'he'/.test(server));
check('whole-message classification stays OFF: the deeper read is a sentence at a time, and the chip never reaches it', /const REMOTE_CLASSIFY = false;/.test(gmail) && !/FlowAiLadder|ladder-read/.test(gmail));
check('the content script loads the ladder after the local model and before the code that uses it', (() => { const js = manifest.content_scripts[0].js; return js.indexOf('core/ai-ladder.js') > js.indexOf('core/local-lm.js') && js.indexOf('core/ai-ladder.js') < js.indexOf('src/follow.js') && js.indexOf('core/exec-router.js') >= 0 && js.indexOf('core/mask-ids.js') >= 0; })());
check('the popup loads it too', /core\/ai-ladder\.js/.test(popupHtml));
check('nothing is sent before the person said yes: the worker checks consent, the switch and availability before every read', /if \(!state\.enabled \|\| !state\.available \|\| !state\.consent\) return \{ ok: false, code: 'off' \}/.test(bg));
check('only the popup can give or take back the consent, never a page script', /sender && sender\.tab \? Promise\.resolve\(\{ ok: false, reason: 'popup-only' \}\)/.test(bg));
check('the worker forwards the masked sentence only: nothing else from the page (no language, instructions, tier or model) goes on the request', /Object\.assign\(\{ action: 'ladder-read', maskedSentence: sentence \}, body\)/.test(bg) && !/payload\.(?:tier|instructions|system|model|lang|prompt)/.test(bg.slice(bg.indexOf('async function ladderRead'), bg.indexOf('a model on this computer'))));
check('the page asks the ladder only after the on-device tiers found nothing', /const local = await lmAskLocal\(text\);\s*return local \|\| ladderAsk\(text\);/.test(follow));
check('the page masks through the one shared function', /FlowExecRouter\.maskForServer\(x, FlowPrivacyShield, FlowMaskIds\)/.test(follow));
check('a strict surface (a chat) never reaches it', /if \(!ask && !watch && !ctx\.strict\) ask = await lmAsk\(mineText\);/.test(follow));
check('the popup row appears only when the worker says the feature is enabled and the server says it is running', /if \(!info \|\| !info\.ok \|\| !info\.enabled\) return;/.test(popup) && L.copy(L.stateOf({ available: false })) === null);
check('the consent text names what is sent and what is replaced', /one sentence/.test(L.copy(L.stateOf({ available: true, consent: false })).detail) && /names, companies, amounts, dates and contact details/.test(L.copy(L.stateOf({ available: true, consent: false })).detail));

if (enabled) {
  check('ENABLED: the privacy page has the section, says it is off until turned on, and who reads it', /Second reading of one sentence: off until you turn it on/.test(privacy) && /Anthropic Haiku/.test(privacy) && /xAI/.test(privacy) && /Sonnet/.test(privacy), 'copy missing');
  check('ENABLED: the privacy page states the allowance with the numbers the code enforces', privacy.indexOf(num(L.PLANS.free.units) + ' second readings on Free') >= 0 && privacy.indexOf(num(L.PLANS.pro.units) + ' on Glance Pro') >= 0, { free: L.PLANS.free.units, pro: L.PLANS.pro.units });
  check('ENABLED: the privacy page says the masking can miss things, that nothing but the sentence is sent, and what is kept', /first name used alone/.test(privacy) && /never the thread, the subject or who wrote to whom/.test(privacy) && /we keep no sentence and no answer/.test(privacy));
  check('ENABLED: the privacy page says what happens when the allowance ends and that the answer cannot act', /Glance carries on on your device as before/.test(privacy) && /can never close, write or send anything/.test(privacy));
  check('ENABLED: the privacy page says the extension asks the server whether it is running, and what that carries', /asks our server with your random install identifier/.test(privacy) && /no message text is part of that/.test(privacy));
  check('ENABLED: the privacy page no longer says "none of this passes through us" without the exception, and lists the processors', /with one exception that is off until you turn it on/.test(privacy) && /also read the single masked sentence/.test(privacy));
  check('ENABLED: the privacy page keeps the line about regulated material', /do not turn this on for mail like that/.test(privacy));
  check('ENABLED: no page still makes the old, absolute promise', !/never leaves your device to be judged/.test(trial) && !/Only the optional Pro drafts and attachment summaries ever leave your machine/.test(trial) && !/never sent anywhere to decide/.test(popupHtml));
  check('ENABLED: the trial page and the popup say it, with the allowance', /second reading/i.test(trial) && trial.indexOf('120 on Free') >= 0 && /second reading/.test(popupHtml));
  check('ENABLED: the store text and the README say it', /second\s+reading/.test(store) && /Second reading/.test(readme) && /GLANCE_AI_LADDER/.test(readme));
} else {
  check('DISABLED: no page describes a path that is not running', !/Second reading of one sentence/.test(privacy) && !/second reading/i.test(trial));
}
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
