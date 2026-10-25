// W1 WhatsApp gesture scan contract. Run: node test/whatsapp-w1-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const draftSrc = fs.readFileSync(path.join(ROOT, 'src/content-whatsapp-draft.js'), 'utf8');
const waSrc = fs.readFileSync(path.join(ROOT, 'src/content-whatsapp.js'), 'utf8');
check('draft lane has no MutationObserver', !/MutationObserver/.test(draftSrc));
check('follow lane has no MutationObserver', !/MutationObserver/.test(waSrc));
check('scan requires gesture', /gesture !== true/.test(draftSrc));

const dom = new (require('jsdom').JSDOM)(fs.readFileSync(path.join(ROOT, 'test/fixtures/chat/whatsapp-w1-en-place.html'), 'utf8'), { runScripts: 'outside-only', url: 'https://web.whatsapp.com/' });
const ctx = dom.window;
['../core/fact-reply.js', '../core/close-chains.js', '../src/chat-redact.js', '../src/chat-draft.js', '../src/chat-compose.js', '../src/chat-lane.js', '../src/whatsapp-parse.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: path.basename(f) });
});
ctx.chrome = { runtime: { sendMessage: () => {}, id: 'x' } };
vm.runInContext(draftSrc, ctx, { filename: 'content-whatsapp-draft.js' });

(async () => {
  const silent = await ctx.__glanceChatSurfaces.whatsapp.scan({});
  check('scan without gesture is silent', silent.reason === 'no-gesture');
  console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
  process.exit(failures ? 1 : 0);
})();
