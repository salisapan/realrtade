'use strict';
// Live OWA shape: message-body / RtfEditor without role=document. Reverting owa-parse.js
// to the pre-#245 parser must fail the body read row (mutant P1 in verify-ca1-r9).
// Run: node test/owa-parse-revert-guard-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 500) : ''); }
}

function loadOwaParse(src) {
  const sb = { module: undefined, console };
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: 'owa-parse.js' });
  return vm.runInContext('FlowOwaParse', sb);
}

function readPane(Owa, html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    get() {
      return this.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>/gi, '\n')
        .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, '').replace(/\n{3,}/g, '\n\n').trim();
    }
  });
  return Owa.readPane(w.document, url);
}

const liveHtml = fs.readFileSync(path.join(__dirname, 'fixtures/owa-reading-pane-live-2026-10.html'), 'utf8');
const rtfOnly = liveHtml.replace(
  /<div data-testid="message-body" class="XbIp4 allowTextSelection" tabindex="0">[\s\S]*?<\/div>/,
  '<div class="RtfEditor" role="presentation"><div>אפשר לקבוע פגישת סטטוס ביום שישי 30/10 בשעה 10:00 לחצי שעה?</div></div>'
);
const url = 'https://outlook.live.com/mail/0/inbox/id/AQQkADAwATM0MDAAMS0wZTAwAC04MzYzLTAwAi0wMAoAEABHUtuqMLBpTa8pX9R6Eknj';
const ASK = 'פגישת סטטוס';

const currentSrc = fs.readFileSync(path.join(ROOT, 'core', 'owa-parse.js'), 'utf8');
const current = loadOwaParse(currentSrc);
const cur = readPane(current, rtfOnly, url);
check('current owa-parse reads the RtfEditor-only live body without subject leak', cur && (cur.text || '').indexOf(ASK) >= 0 && (cur.text || '').indexOf('סטטוס שישי') < 0, cur);

let oldSrc;
try {
  oldSrc = execSync('git show fce113d2:flow-trial-extension/core/owa-parse.js', { encoding: 'utf8', maxBuffer: 8e6 });
} catch (e) {
  check('baseline fce113d2 owa-parse.js is available', false, String(e.message || e));
  oldSrc = '';
}
if (oldSrc) {
  const old = loadOwaParse(oldSrc);
  const prev = readPane(old, rtfOnly, url);
  check('fce113d2 owa-parse leaks the subject into text on RtfEditor-only shell (revert mutant fails)', prev && (prev.text || '').indexOf(ASK) >= 0 && (prev.text || '').indexOf('סטטוס שישי') === 0, prev);
}

console.log(failures ? '\nTOTAL FAILURES: ' + failures : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
