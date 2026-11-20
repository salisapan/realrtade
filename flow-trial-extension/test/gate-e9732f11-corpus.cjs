// Live Gate on #213 e9732f11. (a) dismiss and a proved close must write
// glanceUserContextV0 when USER_CONTEXT_WRITER is on. (b) this exact
// self-sent Hebrew quote must offer a Doc preview when FULL_DOCUMENT_CLOSE
// is on. Labs stays off unless the test turns a switch on.
// Run: node test/gate-e9732f11-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowFullDocumentClose: F } = require('../core/full-document-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 500) : ''); }
}

const gmail = fs.readFileSync(path.join(__dirname, '../src/content-gmail.js'), 'utf8');
const SUBJECT = '[G-Quote] בקשה להצעת מחיר';
const BODY = 'אפשר לקבל הצעת מחיר מסודרת לאוטומציה של קליטת לקוחות במשרד? 5 עובדים';
const MAIL = SUBJECT + '. ' + BODY;

const plan = F.plan({
  flags: { FULL_DOCUMENT_CLOSE: true },
  text: MAIL,
  lang: 'he'
});
check('(b) exact Hebrew quote is recognized', F.recognize(MAIL).kind === 'clear', F.recognize(MAIL));
check('(b) exact Hebrew quote offers a Doc preview with no company template', plan.action === 'offer' && plan.previewOnly === true && plan.built && plan.built.blank !== true && plan.built.html && plan.built.html.indexOf(F.PRICE_PLACEHOLDER) !== -1, plan);
check('(b) the preview does not invent a price from "5 עובדים"', plan.built && plan.built.html && plan.built.html.indexOf('5 עובדים') === -1 && plan.built.html.indexOf(F.PRICE_PLACEHOLDER) !== -1, plan.built && plan.built.html);
check('(b) switch off stays off for that mail', F.plan({ flags: {}, text: MAIL, lang: 'he' }).action === 'off');

const chipCall = gmail.match(/if \(([^)]*)await showFullDocumentChip/);
check('(b) self-sent mail can reach the full-document chip', chipCall && chipCall[1].indexOf('inboundMail') === -1, chipCall && chipCall[1]);

const chipFn = gmail.slice(gmail.indexOf('async function showFullDocumentChip'), gmail.indexOf('async function showGoogleContactsChip'));
check('(b) full-document switch is glanceSwitchOn(FULL_DOCUMENT_CLOSE), not FlowStorage.get', /glanceSwitchOn\('FULL_DOCUMENT_CLOSE'\)/.test(chipFn) && !/FlowStorage\.get\(/.test(chipFn), chipFn.slice(0, 400));
check('(b) full-document plan logs elapsed milliseconds', /\[Glance\] full-document plan ms/.test(chipFn) && /Date\.now\(\)/.test(chipFn));

const switchFn = gmail.slice(gmail.indexOf('async function glanceSwitchOn'), gmail.indexOf('function userContextEvent'));
check('(a) page has glanceSwitchOn for Labs rows', switchFn.indexOf('async function glanceSwitchOn') === 0, switchFn.slice(0, 80));
check('(a) user-context switch is not cached from the first read', !/userContextSwitchOn/.test(gmail));

function storageGet(stored, query) {
  if (query && typeof query === 'object' && !Array.isArray(query)) {
    const out = {};
    Object.keys(query).forEach((key) => {
      out[key] = Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : query[key];
    });
    return out;
  }
  return stored;
}

const box = {
  console,
  chrome: {
    runtime: { getManifest: () => ({}) },
    storage: {
      local: {
        get: async (query) => storageGet({
          glanceSwitches: { USER_CONTEXT_WRITER: true, FULL_DOCUMENT_CLOSE: true, CONNECT_ECOSYSTEM: true },
          closeStats: { total: 1, recent: [] },
          styleProfile: { greeting: 'shalom' }
        }, query)
      }
    }
  },
  FlowStorage: {
    get: async () => ({ closeStats: { total: 1, recent: [] }, styleProfile: { greeting: 'shalom' } })
  }
};
function extractFunction(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) return '';
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}
const pageFns = [
  extractFunction(gmail, 'function glanceLabsLocked'),
  extractFunction(gmail, 'async function glanceSwitchOn'),
  extractFunction(gmail, 'async function userContextEnabled')
].join('\n');
vm.createContext(box);
(async () => {
  if (pageFns.indexOf('async function glanceSwitchOn') > 0 && pageFns.indexOf('async function userContextEnabled') > 0) {
    vm.runInContext(pageFns + '\nthis.userContextEnabled = userContextEnabled;\nthis.glanceSwitchOn = glanceSwitchOn;', box);
    check('(a) USER_CONTEXT_WRITER on in glanceSwitches is seen even when FlowStorage.get omits it', box.userContextEnabled && (await box.userContextEnabled()) === true);
    check('(a) FULL_DOCUMENT_CLOSE on in glanceSwitches is seen the same way', (await box.glanceSwitchOn('FULL_DOCUMENT_CLOSE')) === true);
    check('(a) a Labs row that was never turned on stays off', (await box.glanceSwitchOn('MEET_LINK')) === false);
  } else {
    check('(a) USER_CONTEXT_WRITER on in glanceSwitches is seen even when FlowStorage.get omits it', false, 'glanceSwitchOn missing');
    check('(a) FULL_DOCUMENT_CLOSE on in glanceSwitches is seen the same way', false, 'glanceSwitchOn missing');
    check('(a) a Labs row that was never turned on stays off', false, 'glanceSwitchOn missing');
  }

const receipt = gmail.slice(gmail.indexOf('async function showMultiActionReceipt'), gmail.indexOf('async function onDoIt'));
check('(a) a proved close writes glanceUserContextV0 via fetchedBack', /type:\s*'approved'/.test(receipt) && /fetchedBack:\s*true/.test(receipt));
check('(a) Undo of that close writes an undo event', /type:\s*'undo'/.test(receipt));
const proved = gmail.slice(gmail.indexOf('function mountProvedTaskReceipt'), gmail.indexOf('function placeReceipt'));
check('(a) Undo on the remounted task receipt writes an undo event', /type:\s*'undo'/.test(proved));

const { FlowUserContextWriter: W } = require('../core/user-context-writer.js');
let profile = W.empty('me@example.com');
profile = W.applyEvent(profile, { type: 'dismissed', partyKey: 'client@example.com', intentFamily: 'task', at: '2026-11-13T10:00:00.000Z' });
profile = W.applyEvent(profile, { type: 'approved', partyKey: 'client@example.com', intentFamily: 'task', fetchedBack: true, at: '2026-11-13T10:05:00.000Z' });
profile = W.applyEvent(profile, { type: 'undo', partyKey: 'client@example.com', intentFamily: 'task', at: '2026-11-13T10:06:00.000Z' });
const row = profile.decisionHistory.find((r) => r.intentFamily === 'task' && r.party === 'client@example.com');
check('(a) dismiss, proved close, and undo change the profile and not a message body', row && row.dismissed === 1 && row.approvedFetchedBack === 1 && row.undo === 1 && !JSON.stringify(profile).includes(BODY), row);

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
