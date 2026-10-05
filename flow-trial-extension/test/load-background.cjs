// background.js is the extension service worker (manifest "type": "module"),
// so it imports config/oauth.public.js. These corpora evaluate it as a
// classic script inside vm, which cannot take that import. Load the public
// config in the same script and drop the one import line. The service
// worker itself stays a module.

const fs = require('fs');
const path = require('path');

const IMPORT_LINE = /^import \{ OAUTH_PUBLIC, publicClientId \} from '\.\.\/config\/oauth\.public\.js';\r?\n/m;
const LADDER_IMPORT = /^import \{ LADDER \} from '\.\.\/config\/ladder\.public\.js';\r?\n/m;
const LIVING_IMPORTS = /^import '\.\.\/core\/living-icon\.js';[^\n]*\r?\nimport '\.\/living-toolbar\.js';[^\n]*\r?\n/m;
const HYBRID_IMPORTS = /^import \{ HYBRID \} from '\.\.\/config\/hybrid\.public\.js';\r?\nimport '\.\/hybrid-sw\.js';[^\n]*\r?\n/m;

function backgroundScript() {
  const root = path.join(__dirname, '..');
  const oauth = fs.readFileSync(path.join(root, 'config', 'oauth.public.js'), 'utf8')
    .replace(/^export const /m, 'const ')
    .replace(/^export function /m, 'function ');
  const hybridCfg = fs.readFileSync(path.join(root, 'config', 'hybrid.public.js'), 'utf8').replace(/^export const /m, 'const ');
  const ladderCfg = fs.readFileSync(path.join(root, 'config', 'ladder.public.js'), 'utf8').replace(/^export const /m, 'const ');
  const hybridSw = fs.readFileSync(path.join(root, 'src', 'hybrid-sw.js'), 'utf8');
  const bg = fs.readFileSync(path.join(root, 'src', 'background.js'), 'utf8').replace(IMPORT_LINE, '').replace(HYBRID_IMPORTS, '').replace(LADDER_IMPORT, '').replace(LIVING_IMPORTS, '');
  if (/^\s*import\s/m.test(bg)) {
    throw new Error('background.js has an import the corpus harness does not load');
  }
  // living-icon.js and living-toolbar.js are classic scripts that set their globals the same way.
  const classic = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/^if \(typeof module[\s\S]*$/m, '');
  const living = classic('core/living-icon.js') + '\nglobalThis.FlowLivingIcon = FlowLivingIcon;\n' + classic('src/living-toolbar.js') + '\nglobalThis.FlowLivingToolbar = FlowLivingToolbar;\n';
  // hybrid-sw.js is a classic script that sets globalThis.FlowHybridSW when it is not run under Node's module system.
  return oauth + '\n' + hybridCfg + '\n' + ladderCfg + '\n' + hybridSw.replace(/^if \(typeof module[\s\S]*$/m, 'globalThis.FlowHybridSW = FlowHybridSW;\n') + '\n' + living + '\n' + bg;
}

module.exports = { backgroundScript };
