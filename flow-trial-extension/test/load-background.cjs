// background.js is the extension service worker (manifest "type": "module"),
// so it imports config/oauth.public.js and src/google-web-auth.js. These
// corpora evaluate it as a classic script inside vm, which cannot take
// those imports. Load both modules in the same script and drop the import
// lines. The service worker itself stays a module.

const fs = require('fs');
const path = require('path');

function stripModuleSyntax(source) {
  return source
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ');
}

const IMPORT_LINE = /^import \{ OAUTH_PUBLIC, publicClientId(?:, WEB_OAUTH_CLIENT_ID)? \} from '\.\.\/config\/oauth\.public\.js';\r?\n/m;
const WEB_AUTH_IMPORT = /^import \{[^}]+\} from '\.\/google-web-auth\.js';\r?\n/m;
const LADDER_IMPORT = /^import \{ LADDER \} from '\.\.\/config\/ladder\.public\.js';\r?\n/m;
const LANE_HOST_IMPORT = /^import '\.\/google-lane-host\.js';\r?\n/m;
const CLASSIC_IMPORT = /^import '((?:\.\.\/core|\.\.\/lane-chat|\.)\/[\w-]+\.js)';[^\n]*\r?\n/gm;
const HYBRID_IMPORTS = /^import \{ HYBRID \} from '\.\.\/config\/hybrid\.public\.js';\r?\nimport '\.\/hybrid-sw\.js';[^\n]*\r?\n/m;

function backgroundScript() {
  const root = path.join(__dirname, '..');
  const oauth = stripModuleSyntax(fs.readFileSync(path.join(root, 'config', 'oauth.public.js'), 'utf8'));
  const webAuth = stripModuleSyntax(fs.readFileSync(path.join(root, 'src', 'google-web-auth.js'), 'utf8'));
  const hybridCfg = fs.readFileSync(path.join(root, 'config', 'hybrid.public.js'), 'utf8').replace(/^export const /m, 'const ');
  const ladderCfg = fs.readFileSync(path.join(root, 'config', 'ladder.public.js'), 'utf8').replace(/^export const /m, 'const ');
  const hybridSw = fs.readFileSync(path.join(root, 'src', 'hybrid-sw.js'), 'utf8');
  // Classic scripts imported for their side effect (they set a global): inline them, with their CommonJS export line
  // turned into the same global assignment they make in the service worker.
  const classic = [];
  let bg = fs.readFileSync(path.join(root, 'src', 'background.js'), 'utf8').replace(IMPORT_LINE, '').replace(WEB_AUTH_IMPORT, '').replace(HYBRID_IMPORTS, '').replace(LADDER_IMPORT, '').replace(LANE_HOST_IMPORT, '');
  bg = bg.replace(CLASSIC_IMPORT, (line, rel) => {
    const file = path.join(root, 'src', rel);
    const src = fs.readFileSync(file, 'utf8');
    const m = src.match(/^if \(typeof module !== 'undefined'\) module\.exports = \{ (\w+) \};[\s\S]*$/m);
    classic.push(m ? src.replace(m[0], 'globalThis.' + m[1] + ' = ' + m[1] + ';\n') : src);
    return '';
  });
  if (/^\s*import\s/m.test(bg)) {
    throw new Error('background.js has an import the corpus harness does not load');
  }
  // hybrid-sw.js is a classic script that sets globalThis.FlowHybridSW when it is not run under Node's module system.
  return oauth + '\n' + webAuth + '\n' + hybridCfg + '\n' + ladderCfg + '\n' + hybridSw.replace(/^if \(typeof module[\s\S]*$/m, 'globalThis.FlowHybridSW = FlowHybridSW;\n') + '\n' +
    classic.map((c) => '{\n' + c + '\n}').join('\n') + '\n' + bg;
}

// The lane host (src/google-lane-host.js) owns the one lookup-then-create of
// the list titled Glance and the account of a token. background.js reaches it
// through globalThis.FlowGoogleLaneAccount. Corpora that run background.js
// alone run this stand-in after it: it answers the same bridge from the
// routes of the check (the account is unknown, so no token is refused).
const LANE_ACCOUNT_STUB = `globalThis.FlowGoogleLaneAccount = { read: async () => '', accountOf: async () => '', record: async () => '', ensureGlanceList: async () => {
  const listed = await googleTasksAuthedFetch('/users/@me/lists?maxResults=100');
  if (!listed.ok) return '';
  const found = ((await listed.json()).items || []).find((l) => l.title === 'Glance');
  if (found) return found.id;
  const made = await googleTasksAuthedFetch('/users/@me/lists', { method: 'POST', body: JSON.stringify({ title: 'Glance' }) });
  return made.ok ? (await made.json()).id : '';
} };`;

module.exports = { backgroundScript, LANE_ACCOUNT_STUB };
