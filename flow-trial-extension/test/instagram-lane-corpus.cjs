#!/usr/bin/env node
// Instagram click-only lane (PR-I): flag off, gesture, kill switch, redaction, never-send.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let failed = 0;
function check(label, ok, detail) {
  if (!ok) {
    failed += 1;
    console.error('FAIL:', label, detail || '');
  } else {
    console.log('ok:', label);
  }
}

const { FlowChatRedact } = require('../src/chat-redact.js');
const { FlowChatKillSwitch } = require('../core/chat-kill-switch.js');
const surfaces = require('../lane-chat/surfaces.js');

check('surfaces registers Instagram with flag off by default', surfaces.byId('instagram') && surfaces.byId('instagram').defaultOn === false && surfaces.byId('instagram').flag === 'INSTAGRAM_LANE');
check('Instagram flag is separate from Messenger', surfaces.byId('messenger').flag === 'MESSENGER_LANE' && surfaces.byId('instagram').flag !== surfaces.byId('messenger').flag);

const masked = FlowChatRedact.redactText('Dana Levi תשלם 123456789 ₪500 policy ABC-12345', { names: ['Dana Levi'] });
check('redaction masks id policy amount and name', masked.indexOf('123456789') < 0 && masked.indexOf('₪500') < 0 && masked.indexOf('Dana') < 0 && /\[id\]/.test(masked) && /\[amount\]/.test(masked));

FlowChatKillSwitch.setRemote('instagram', false);
check('remote kill off allows lane when not user-off', FlowChatKillSwitch.killedSync('instagram') === false);
FlowChatKillSwitch.setRemote('instagram', true);
check('remote kill on silences instagram', FlowChatKillSwitch.killedSync('instagram') === true);
FlowChatKillSwitch.setRemote('instagram', false);

const LANE_JS = surfaces.byId('instagram').js;
const PLACE_HTML = fs.readFileSync(path.join(__dirname, 'fixtures/chat/instagram-place.html'), 'utf8');
const TAIZU = 'Taizu, 23 Montefiore, Tel Aviv';
function placeEvidence(events) {
  return { connected: { calendar: true }, events: events };
}
function oneEvent() {
  return { id: 'e1', location: TAIZU, startIso: '2026-10-06T19:00:00', status: 'confirmed' };
}

function memoryStorage(bag) {
  return {
    bag,
    local: {
      get(name) {
        if (typeof name === 'string') return Promise.resolve({ [name]: bag[name] });
        return Promise.resolve(Object.assign({}, bag));
      },
      set(obj) {
        Object.keys(obj || {}).forEach((k) => { bag[k] = obj[k]; });
        return Promise.resolve();
      }
    }
  };
}

async function openInstagram(opts) {
  const o = opts || {};
  const dom = new JSDOM(o.html || PLACE_HTML, { url: o.url || 'https://www.instagram.com/direct/t/abc/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const RealDate = w.Date;
  const fixed = new RealDate(2026, 9, 14, 12).getTime();
  function FixedDate(...args) {
    if (args.length === 0) return new RealDate(fixed);
    return new RealDate(...args);
  }
  FixedDate.now = () => fixed;
  FixedDate.parse = RealDate.parse.bind(RealDate);
  FixedDate.UTC = RealDate.UTC.bind(RealDate);
  FixedDate.prototype = RealDate.prototype;
  w.Date = FixedDate;
  const sent = [];
  const storageBag = Object.assign({ glanceSwitches: { INSTAGRAM_LANE: true } }, o.storageBag || {});
  w.chrome = {
    runtime: {
      id: 'glance-test',
      lastError: null,
      sendMessage(msg, cb) {
        sent.push(msg);
        let reply = { ok: true, sends: false, evidence: placeEvidence([oneEvent()]) };
        if (msg && msg.type === 'flow:fact-sources') {
          reply = { ok: true, truncated: false, sources: [{ id: 'sheet-1', name: 'Budget', kind: 'sheet', text: 'Q3 total,1840\n' }] };
        }
        if (cb) setTimeout(() => cb(reply), 0);
      }
    },
    storage: memoryStorage(storageBag)
  };
  const ctx = dom.getInternalVMContext();
  LANE_JS.forEach((rel) => {
    new vm.Script(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel }).runInContext(ctx);
  });
  await new Promise((r) => setTimeout(r, 20));
  return {
    w,
    sent,
    ctx,
    dom,
    scan(gesture) {
      const arg = gesture ? '{gesture:true}' : '';
      return vm.runInContext('(async () => globalThis.__glanceChatSurfaces.instagram.scan(' + arg + '))()', ctx);
    }
  };
}

(async () => {
  const idle = await openInstagram();
  check('no DOM read without gesture', idle.w.document.querySelector('[data-glance-composer="1"]').textContent.trim() === '');
  idle.dom.window.close();

  const flaggedOff = await openInstagram({ storageBag: { glanceSwitches: { INSTAGRAM_LANE: false } } });
  await flaggedOff.scan(true);
  await new Promise((r) => setTimeout(r, 40));
  check('flag off stays quiet even with gesture', flaggedOff.w.document.querySelector('[data-glance-composer="1"]').textContent.trim() === '');
  flaggedOff.dom.window.close();

  const killed = await openInstagram({ storageBag: { glanceSwitches: { INSTAGRAM_LANE: true }, 'glanceChatOff.instagram': true } });
  await killed.scan(true);
  await new Promise((r) => setTimeout(r, 40));
  check('kill switch silences', killed.w.document.querySelector('[data-glance-composer="1"]').textContent.trim() === '');
  killed.dom.window.close();

  const on = await openInstagram();
  await on.scan(true);
  await new Promise((r) => setTimeout(r, 80));
  const box = on.w.document.querySelector('[data-glance-composer="1"]');
  check('gesture + flag drafts without send clicks', box.textContent.trim().indexOf('Taizu') >= 0);
  const factPayload = on.sent.find((m) => m && m.type === 'flow:fact-sources');
  if (factPayload && factPayload.payload) {
    const raw = JSON.stringify(factPayload.payload);
    check('outbound fact payload is redacted when names provided', raw.indexOf('Dana') < 0 || raw.indexOf('[name]') >= 0);
  }
  on.dom.window.close();

  const igSrc = fs.readFileSync(path.join(ROOT, 'src/content-instagram.js'), 'utf8');
  check('never auto-observes DOM', !/new MutationObserver/.test(igSrc));
  check('window guard prevents double inject', /window\.__glanceLaneChat/.test(igSrc));

  const enableHtml = fs.readFileSync(path.join(ROOT, 'lane-chat/enable.html'), 'utf8');
  check('consent names for Instagram in Latin and disclaims Meta', /for Instagram/.test(enableHtml) && /not affiliated with/i.test(enableHtml) && !/אינסטגרם/.test(enableHtml));

  if (failed) {
    console.error('\n' + failed + ' failed');
    process.exit(1);
  }
  console.log('\ninstagram-lane-corpus: pass');
})();
