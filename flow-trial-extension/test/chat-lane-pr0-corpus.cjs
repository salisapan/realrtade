// PR-0 shared chat lane: redaction, remote kill switch, compose proof.
// Run: node test/chat-lane-pr0-corpus.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

globalThis.__glanceFlagsConfig = {
  URL: 'https://theflow-ai.com/glance-flags.json',
  PUBLIC_JWK: require('../config/glance-flags.public.js').GLANCE_FLAGS_PUBLIC_JWK
};

const { FlowChatRedact } = require('../src/chat-redact.js');
const { FlowChatCompose } = require('../src/chat-compose.js');
const { FlowChatKillSwitch } = require('../core/chat-kill-switch.js');

check('Israeli ID redaction', FlowChatRedact.redactPayload('תעודת זהות 000000000', {}).text.indexOf('[ID]') >= 0);
check('amount redaction', FlowChatRedact.redactPayload('שלם 500 ₪ עד חמישי', {}).text.indexOf('[AMOUNT]') >= 0);
check('name redaction', FlowChatRedact.redactPayload('היי דנה', { names: ['דנה'] }).text.indexOf('[NAME]') >= 0);
check('medical warns', FlowChatRedact.medicalCheck('I need my chemotherapy schedule').level === 'warn');
check('draft hash stable', FlowChatCompose.draftHash('hello') === FlowChatCompose.draftHash('hello'));

const flagsFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'flow-landing', 'glance-flags.json'), 'utf8'));
check('repo glance-flags verifies', FlowChatKillSwitch.verifySync(flagsFile, globalThis.__glanceFlagsConfig.PUBLIC_JWK));
check('repo flags keep all chat lanes off', FlowChatKillSwitch.lanesFromChatFlags(flagsFile.chatLanes).whatsapp === true);

const never = FlowChatKillSwitch.allOff(true);
check('never fetched is all off', never.neverFetched === true && never.off.whatsapp === true && never.off.messenger === true);

const enabled = FlowChatKillSwitch.parseRemoteBody({
  version: 1,
  chatLanes: { all: { enabled: true }, whatsapp: { enabled: true }, messenger: { enabled: false }, instagram: { enabled: false } },
  signature: 'x'
}, { skipVerify: true });
check('remote enables only whatsapp when all on', enabled.off.whatsapp !== true && enabled.off.messenger === true);

const last = { off: { whatsapp: false, messenger: true, instagram: true }, fetchedAt: 1, neverFetched: false, valid: true };
check('fetch failure keeps last known', FlowChatKillSwitch.isSurfaceOff('whatsapp', {}, last).off === false);

const registered = [];
const mockChrome = {
  scripting: {
    async unregisterContentScripts() {},
    async registerContentScripts(rows) { registered.push(rows[0].id); }
  },
  storage: {
    local: {
      async get() { return {}; },
      async set() {}
    }
  }
};
globalThis.FlowLaneChatSurfaces = {
  TRIGGER_JS: ['src/chat-lane-trigger.js'],
  SURFACES: [
    { id: 'glance-lane-whatsapp', key: 'whatsapp', origins: ['https://web.whatsapp.com/*'] },
    { id: 'glance-lane-messenger', key: 'messenger', origins: ['https://www.messenger.com/*'] }
  ]
};
globalThis.FlowChatOnDemand = {
  registerTriggerScripts: async (api) => {
    for (const row of globalThis.FlowLaneChatSurfaces.SURFACES) {
      const id = row.id + '-trigger';
      try { await api.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* */ }
      const allowed = await FlowChatKillSwitch.isAllowed(api, row.key);
      if (!allowed) continue;
      await api.scripting.registerContentScripts([{ id: id }]);
    }
  }
};

(async () => {
  const box = {
    isContentEditable: true,
    textContent: '',
    innerText: '',
    getAttribute() { return 'true'; },
    focus() {},
    dispatchEvent() {}
  };
  Object.defineProperty(box, 'textContent', {
    get() { return this._t || ''; },
    set(v) { this._t = v; this.innerText = v; }
  });
  const r = await FlowChatCompose.insertDraftWithProof(box, 'Draft line here', { surface: 'whatsapp', threadId: 'wa:1' });
  check('insertDraftWithProof fetchedBack', r.ok === true && r.fetchedBack === true && r.proof && r.proof.draftHash);

  await FlowChatKillSwitch.applyTriggers(mockChrome);
  check('killed surfaces skip trigger registration', registered.indexOf('glance-lane-whatsapp-trigger') < 0);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  check('manifest activeTab', manifest.permissions.indexOf('activeTab') >= 0);
  check('kill switch polls every 6h', FlowChatKillSwitch.POLL_MINUTES === 360);
  check('flags URL', FlowChatKillSwitch.canonicalPayload(flagsFile).length > 10);

  console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
  process.exit(failures ? 1 : 0);
})();
