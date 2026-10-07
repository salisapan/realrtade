'use strict';
// Node-only test helper (not shipped): loads the extension's engine core files into a vm sandbox, exactly like teacher/engine.cjs,
// and returns them in the shape gs-prepare expects ({J,G,OC,GM,FX,FJ,DEPS}). In the extension these are the content-script globals.
const fs = require('fs'), path = require('path'), vm = require('vm');
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js',
  'file-attach.js', 'fact-reply.js', 'quiet-metrics.js', 'resolution.js', 'commitment-title.js', 'graph-mail.js',
  'incoming-judge.js', 'outlook-calendar.js', 'draft-reply.js'];
const { engineRoot, engineVersion } = require('../../../paths.cjs');
const ROOT = process.env.GLANCE_CORE_ROOT || process.env.GLANCE_ENGINE_ROOT || engineRoot();
const OWN = { gmail: 'ai.local.flow@gmail.com', outlook: 'glance.salisapan@outlook.com' };
const NOW = new Date(process.env.GLANCE_NOW || '2026-10-07T12:00:00+03:00');
function loadCore(root) {
  root = root || ROOT;
  const sb = { module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, exports: {}, TextEncoder, atob, btoa };
  sb.globalThis = sb; vm.createContext(sb);
  for (const f of FILES) { const p = path.join(root, 'core', f); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sb, { filename: 'core/' + f }); }
  const g = (n) => { try { return vm.runInContext('typeof ' + n + ' !== "undefined" ? ' + n + ' : null', sb); } catch (e) { return null; } };
  return { J: g('FlowIncomingJudge'), G: g('FlowGoogleCloses'), OC: g('FlowOutlookCalendar'), GM: g('FlowGraphMail'), FX: g('FlowExtract'), FJ: g('FlowJudgment'),
    DEPS: { intent: g('FlowIntent'), actions: g('FlowActions'), factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') } };
}
const OWN_NAMES = ['Sali', 'Sali Sapan', 'סאלי'];
function optsFor(r, core) { return { core, ownEmail: OWN[r.surface === 'outlook' ? 'outlook' : 'gmail'], ownNames: r.ownNames || OWN_NAMES, now: NOW, engineVersion: process.env.GLANCE_V2_ENGINE || engineVersion(ROOT), messageId: r.id }; }
module.exports = { loadCore, OWN, NOW, OWN_NAMES, optsFor, ROOT };
