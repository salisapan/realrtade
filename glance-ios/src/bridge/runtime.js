// JavaScriptCore / Hermes entry: load assets/core-bundle.js in the native host,
// then call GlanceNativeBridge.judge. This module is tested in Node via vm.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let cached = null;

function loadBundle() {
  if (cached) return cached;
  const bundlePath = path.join(__dirname, '..', '..', 'assets', 'core-bundle.js');
  if (!fs.existsSync(bundlePath)) {
    require(path.join(__dirname, '..', '..', 'scripts', 'build-core-bundle.js'));
  }
  const sandbox = { console, module: undefined };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), sandbox, { filename: 'core-bundle.js' });
  cached = sandbox.GlanceNativeBridge;
  return cached;
}

function judgeSharedText(text, opts) {
  const bridge = loadBundle();
  const ctx = opts || {};
  return bridge.judge({
    text: String(text || ''),
    subject: ctx.subject || '',
    sender: ctx.sender || { email: null, name: null },
    to: ctx.to || [],
    ownAddresses: ctx.ownAddresses || ctx.to || [],
    now: ctx.now || new Date(),
    surface: ctx.surface || 'extension',
    attachmentCount: 0
  });
}

function draftForShare(text, opts) {
  const judged = judgeSharedText(text, opts);
  if (!judged || !judged.show || !judged.process) return null;
  const bridge = loadBundle();
  return bridge.draftText(judged.process, {
    sender: (opts && opts.sender) || null,
    subject: (opts && opts.subject) || null
  });
}

function waMePrefill(draft) {
  if (!draft) return null;
  return 'https://wa.me/?text=' + encodeURIComponent(draft);
}

module.exports = { loadBundle, judgeSharedText, draftForShare, waMePrefill };
