// Promise versus reality for the hybrid execution path: the switch, the permission it needs, and the privacy page.
// If the path is switched on, the privacy page must say what it does (docs/hybrid-execution-architecture.md §13). If it is off, no surface may show it.
// Run: node test/hybrid-copy-corpus.cjs
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const cfgText = fs.readFileSync(path.join(ROOT, 'config', 'hybrid.public.js'), 'utf8');
const enabled = /enabled:\s*true/.test(cfgText);
const privacy = fs.readFileSync(path.join(ROOT, '..', 'flow-landing', 'privacy.html'), 'utf8');
const store = fs.readFileSync(path.join(ROOT, 'docs', 'chrome-web-store-submission.md'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const popup = fs.readFileSync(path.join(ROOT, 'popup', 'popup.js'), 'utf8');

check('the switch is a plain boolean in the public config', /enabled:\s*(true|false)/.test(cfgText));
check('the permission the path needs is declared, and explained to the store', manifest.permissions.indexOf('offscreen') >= 0 && /`offscreen`/.test(store));
check('the extension-pages policy allows WebAssembly and nothing broader', /script-src 'self' 'wasm-unsafe-eval'/.test(manifest.content_security_policy.extension_pages) && !/unsafe-eval'(?!.*wasm)/.test(manifest.content_security_policy.extension_pages.replace('wasm-unsafe-eval', '')));
check('no host permission was added for the model hosts (the model files are fetched with CORS, not by an extension permission)', !(manifest.host_permissions || []).concat(manifest.optional_host_permissions || []).some((h) => /huggingface|hf\.co|githubusercontent/.test(h)));
check('the popup row only appears when the worker says the path is enabled (it asks, it does not assume)', /flow:hybrid-status/.test(popup) && /if \(!v\.visible\) return/.test(popup));
if (enabled) {
  check('ENABLED: the privacy page says a model may run on the device and what is downloaded', /A model on your device/.test(privacy) && /2\.2 GB/.test(privacy), 'copy missing');
  check('ENABLED: the privacy page says masked text may go to our server and to which model providers', /masked/.test(privacy) && /Mistral/.test(privacy) && /Anthropic/.test(privacy), 'copy missing');
  check('ENABLED: the privacy page says the masking can miss things', /first name/.test(privacy), 'copy missing');
} else {
  check('DISABLED: the privacy page does not describe a path that is not running', !/A model on your device/.test(privacy));
}
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
