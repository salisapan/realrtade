// WHATSAPP_ENGINE runtime gate: same inbound message drafts only when the switch is on.
// Run: node test/whatsapp-engine-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const MAPS = 'https://www.google.com/maps/search/?api=1&query=';
const FIXED = new Date('2026-10-12T11:00:00+03:00').getTime();
const WA_SCRIPTS = [
  'core/fact-reply.js', 'core/close-chains.js', 'src/chat-draft.js', 'src/chat-compose.js', 'src/chat-lane.js',
  'core/whatsapp-engine.js', 'src/whatsapp-parse.js', 'src/chip-host.js', 'src/content-whatsapp-draft.js'
];

function memoryStorage(bag) {
  return {
    bag: bag,
    local: {
      get(name) {
        if (typeof name === 'string') return Promise.resolve({ [name]: bag[name] });
        const defaults = name || {};
        const out = Object.assign({}, defaults);
        Object.keys(bag).forEach((k) => { out[k] = bag[k]; });
        return Promise.resolve(out);
      },
      set(obj) {
        Object.keys(obj || {}).forEach((k) => { bag[k] = obj[k]; });
        return Promise.resolve();
      }
    }
  };
}

function placeEvidence(events) {
  return { connected: { calendar: true }, events: events };
}
function one() {
  return { location: 'Taizu, 23 Montefiore, Tel Aviv', startIso: '2026-10-08T10:00:00+03:00' };
}

async function runWhatsApp(engineOn) {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/chat/whatsapp-place.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://web.whatsapp.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const RealDate = w.Date;
  w.Date = class extends RealDate {
    constructor(...args) { if (args.length === 0) super(FIXED); else super(...args); }
    static now() { return FIXED; }
  };
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() { return this.textContent || ''; },
    set(v) { this.textContent = v; }
  });
  const bag = { glanceSwitches: { WHATSAPP_ENGINE: engineOn === true } };
  w.chrome = {
    runtime: {
      id: 'glance-test',
      lastError: null,
      sendMessage(msg, cb) {
        const reply = { ok: true, sends: false, evidence: placeEvidence([one()]) };
        if (cb) setTimeout(() => cb(reply), 0);
      }
    },
    storage: memoryStorage(bag)
  };
  const ctx = dom.getInternalVMContext();
  WA_SCRIPTS.forEach((rel) => {
    new vm.Script(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel }).runInContext(ctx);
  });
  await new Promise((r) => setTimeout(r, 8));
  vm.runInContext('globalThis.__glanceChatSurfaces.whatsapp.scan()', ctx);
  await new Promise((r) => setTimeout(r, 50));
  const composer = w.document.querySelector('[data-glance-composer="1"]');
  const receipt = w.document.querySelector('#glance-chat-draft .flow-chip-done');
  return {
    text: composer ? (composer.textContent || '') : '',
    receipt: Boolean(receipt)
  };
}

(async () => {
  const off = await runWhatsApp(false);
  check('WHATSAPP_ENGINE off leaves the composer empty (follow-only lane)', off.text.trim() === '' && off.receipt === false, off);
  const on = await runWhatsApp(true);
  check('WHATSAPP_ENGINE on drafts the place answer', on.text.indexOf('Taizu - ' + MAPS) === 0, on.text);
  check('WHATSAPP_ENGINE on shows the chip-host draft receipt', on.receipt === true, on);
  if (failures) process.exit(1);
  console.log('whatsapp-engine-corpus: all passed');
})();
