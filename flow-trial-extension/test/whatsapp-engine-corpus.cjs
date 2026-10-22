// WHATSAPP_ENGINE: default-off drafts always; switch on enables chat-task engine judging.
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
  'core/whatsapp-engine.js', 'src/whatsapp-parse.js', 'src/chip-host.js'
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

async function runWhatsApp(engineSwitchOn) {
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
  const bag = { glanceSwitches: { WHATSAPP_ENGINE: engineSwitchOn === true } };
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
  new vm.Script(`
    globalThis.FlowChatTaskCard = {
      sync() { globalThis.__waEngineSync = (globalThis.__waEngineSync || 0) + 1; },
      afterDraft() { globalThis.__waEngineAfter = (globalThis.__waEngineAfter || 0) + 1; return Promise.resolve({ shown: false }); }
    };
  `, { filename: 'engine-stub.js' }).runInContext(ctx);
  new vm.Script(fs.readFileSync(path.join(ROOT, 'src/content-whatsapp-draft.js'), 'utf8'), { filename: 'content-whatsapp-draft.js' }).runInContext(ctx);
  await new Promise((r) => setTimeout(r, 30));
  vm.runInContext('globalThis.__glanceChatSurfaces.whatsapp.scan()', ctx);
  await new Promise((r) => setTimeout(r, 60));
  if (engineSwitchOn) {
    vm.runInContext('globalThis.__glanceChatSurfaces.whatsapp.scan()', ctx);
    await new Promise((r) => setTimeout(r, 40));
  }
  const composer = w.document.querySelector('[data-glance-composer="1"]');
  const receipt = w.document.querySelector('#glance-chat-draft .flow-chip-done');
  const sync = vm.runInContext('globalThis.__waEngineSync || 0', ctx);
  const after = vm.runInContext('globalThis.__waEngineAfter || 0', ctx);
  return {
    text: composer ? (composer.textContent || '') : '',
    receipt: Boolean(receipt),
    engineSync: sync,
    engineAfter: after
  };
}

(async () => {
  const off = await runWhatsApp(false);
  check('WHATSAPP_ENGINE off still drafts into the composer (base f945ab57)', off.text.indexOf('Taizu - ' + MAPS) === 0, off);
  check('WHATSAPP_ENGINE off does not run chat-task engine judging', off.engineSync === 0 && off.engineAfter === 0, off);
  const on = await runWhatsApp(true);
  check('WHATSAPP_ENGINE on drafts the place answer', on.text.indexOf('Taizu - ' + MAPS) === 0, on.text);
  check('WHATSAPP_ENGINE on runs engine judging after draft', on.engineSync >= 1 && on.engineAfter >= 1, on);
  check('WHATSAPP_ENGINE on shows the chip-host draft receipt', on.receipt === true, on);
  if (failures) process.exit(1);
  console.log('whatsapp-engine-corpus: all passed');
})();
