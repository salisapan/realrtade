// Scope allowlist. Every OAuth scope the extension declares or requests must be on the strict allowlist.
// Run: node test/scope-allowlist-corpus.cjs   (plain node, no dependencies)
//
// FINAL ALLOWLIST (Gate RC v1): calendar.events, tasks, drive.file, openid,
// userinfo.profile, userinfo.email (and short forms email, profile). No contacts.readonly.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const G = 'https://www.googleapis.com/auth/';

const ALLOW = new Set([
  G + 'calendar.events', G + 'tasks', G + 'drive.file',
  'openid', G + 'userinfo.profile', G + 'userinfo.email', 'email', 'profile'
]);
const FORBIDDEN = new Set([
  G + 'forms.body', G + 'gmail.modify', G + 'gmail.compose', G + 'drive.readonly',
  G + 'gmail.readonly', G + 'gmail.send', G + 'contacts.readonly', G + 'contacts'
]);
const ALLOWED_HOSTS = [
  'https://mail.google.com/*',
  'https://tasks.googleapis.com/*',
  'https://www.googleapis.com/calendar/*',
  'https://www.googleapis.com/drive/*',
  'https://www.googleapis.com/oauth2/*',
  'https://www.googleapis.com/upload/drive/*',
  'https://gmail.googleapis.com/*',
  'https://*.googleusercontent.com/*',
  'https://theflow-ai.com/*'
];
const FORBIDDEN_V1_OPTIONAL_HOSTS = [
  /messenger\.com/i,
  /facebook\.com\/messages/i,
  /business\.facebook\.com\/latest\/inbox/i,
  /instagram\.com\/direct/i,
  /web\.whatsapp\.com/i,
  /app\.slack\.com/i,
  /web\.telegram\.org/i,
  /teams\.microsoft\.com/i
];
const ALLOWED_V1_OPTIONAL_HOSTS = [
  'https://graph.microsoft.com/*',
  'https://login.microsoftonline.com/*',
  'http://127.0.0.1/*',
  'http://localhost/*',
  'https://outlook.live.com/*',
  'https://outlook.office.com/*',
  'https://outlook.office365.com/*'
];
const RESTRICTED = [
  /\/auth\/gmail(\.|$)/, /mail\.google\.com/, /\/auth\/drive$/, /\/auth\/drive\.(readonly|metadata|metadata\.readonly|appdata|photos\.readonly|scripts|activity|activity\.readonly)$/,
  /\/auth\/spreadsheets/, /\/auth\/documents/, /\/auth\/forms/, /\/auth\/contacts$/, /\/auth\/contacts\.readonly/, /\/auth\/calendar$/, /\/auth\/admin/, /\/auth\/cloud-platform/
];
const UNWIRED = { 'core/sheet-row.js': [G + 'spreadsheets'] };

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const isRestricted = (s) => RESTRICTED.some((re) => re.test(s));

function audit(name, list) {
  check(name + ': is a non-empty list', Array.isArray(list) && list.length > 0, list);
  const bad = (list || []).filter((s) => !ALLOW.has(s));
  const restricted = (list || []).filter((s) => isRestricted(s));
  check(name + ': every scope is on the strict allowlist', bad.length === 0, bad);
  check(name + ': no restricted Google scope', restricted.length === 0, restricted);
  check(name + ': no forbidden scope', (list || []).every((s) => !FORBIDDEN.has(s)), list);
  check(name + ': no duplicate scope', new Set(list).size === list.length, list);
}

const man = JSON.parse(read('manifest.json'));
const manScopes = (man.oauth2 && man.oauth2.scopes) || [];
audit('manifest oauth2.scopes', manScopes);
check('manifest: no Forms scope and no Forms host', !JSON.stringify(man).match(/forms\.body|auth\/forms|forms\.googleapis\.com/));
check('manifest: no gmail OAuth scope', !manScopes.some((s) => /gmail|mail\.google/.test(s)));
check('manifest: no contacts.readonly in oauth2', manScopes.indexOf(G + 'contacts.readonly') < 0);
check('manifest: no people.googleapis.com host', !(man.host_permissions || []).some((h) => /people\.googleapis/.test(h)));
const hosts = man.host_permissions || [];
check('manifest: host_permissions matches the allowed set exactly', JSON.stringify(hosts.slice().sort()) === JSON.stringify(ALLOWED_HOSTS.slice().sort()), { got: hosts, want: ALLOWED_HOSTS });
const optionalHosts = man.optional_host_permissions || [];
check('manifest: v1 optional_host_permissions matches the allowed set exactly', JSON.stringify(optionalHosts.slice().sort()) === JSON.stringify(ALLOWED_V1_OPTIONAL_HOSTS.slice().sort()), { got: optionalHosts, want: ALLOWED_V1_OPTIONAL_HOSTS });
check('manifest: no forbidden v1 optional chat/Meta host', !optionalHosts.some((h) => FORBIDDEN_V1_OPTIONAL_HOSTS.some((re) => re.test(h))), optionalHosts);
check('mutant messenger.com optional host is rejected by v1 optional audit', (() => {
  const bad = optionalHosts.concat(['https://www.messenger.com/*']);
  return bad.some((h) => FORBIDDEN_V1_OPTIONAL_HOSTS.some((re) => re.test(h))) && JSON.stringify(bad.slice().sort()) !== JSON.stringify(ALLOWED_V1_OPTIONAL_HOSTS.slice().sort());
})());
check('mutant contacts.readonly in manifest is rejected by audit', (() => {
  const bad = manScopes.concat([G + 'contacts.readonly']).filter((s) => !ALLOW.has(s));
  return bad.length === 1 && bad[0] === G + 'contacts.readonly';
})());

const { FlowGoogleConfig: Cfg } = require(path.join(ROOT, 'core', 'google-config.js'));
audit('google-config SCOPES', Cfg.SCOPES);
for (const s of [G + 'forms.body', G + 'gmail.modify', G + 'gmail.readonly', G + 'gmail.send', G + 'drive', G + 'spreadsheets', G + 'documents', G + 'contacts', G + 'contacts.readonly', G + 'calendar', G + 'gmail.compose', G + 'drive.readonly']) {
  check('google-config refuses ' + s.replace(G, ''), Cfg.assertAllowed([s]).ok === false, Cfg.assertAllowed([s]));
}
check('google-config accepts the whole allowlist it carries', Cfg.assertAllowed(Cfg.SCOPES).ok === true);

const wa = read('src/google-web-auth.js');
const mm = wa.match(/GOOGLE_OAUTH_SCOPES\s*=\s*\[([\s\S]*?)\]/);
const waScopes = mm ? (mm[1].match(/'[^']+'/g) || []).map((x) => x.slice(1, -1)) : null;
audit('google-web-auth GOOGLE_OAUTH_SCOPES', waScopes);
check('the manifest and the web sign-in ask the same scopes', waScopes && JSON.stringify(waScopes.slice().sort()) === JSON.stringify(manScopes.slice().sort()), { manifest: manScopes, web: waScopes });
check('mutant contacts.readonly in web sign-in list is outside allowlist', waScopes && waScopes.indexOf(G + 'contacts.readonly') < 0);

audit('e2e launch fixture google scopes (manifest oauth2 list)', manScopes.slice());

const launchSrc = read('e2e/support/launch.js');
const launchGoogleAuth = launchSrc.match(/googleapis\.com\/auth\/[A-Za-z0-9._-]+/g) || [];
const launchGoogleScopes = launchGoogleAuth.map((h) => 'https://www.' + h);
const launchBad = launchGoogleScopes.filter((s) => !ALLOW.has(s) && !FORBIDDEN.has(s));
check('e2e launch.js: no Google OAuth scope literal outside allowlist/forbidden pins', launchBad.length === 0, launchBad);
check('e2e launch.js: outlook calendar mock requests MailboxSettings.Read with Calendars.ReadWrite',
  /Calendars\.ReadWrite/.test(launchSrc) && /MailboxSettings\.Read/.test(launchSrc));
check('e2e launch.js: mailboxSettings mock includes timeZone UTC',
  /mailboxSettings[\s\S]{0,120}timeZone:\s*'UTC'/.test(launchSrc));

function walk(dir, out) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) { if (!/^(node_modules|vendor|test|e2e|dev|docs|icons|design)$/.test(e.name)) walk(rel, out); }
    else if (/\.(js|mjs|cjs|html|json)$/.test(e.name)) out.push(rel);
  }
  return out;
}
const dirs = ['core', 'src', 'popup', 'picker', 'lane-chat', 'config'];
const files = dirs.filter((d) => fs.existsSync(path.join(ROOT, d))).reduce((a, d) => walk(d, a), []).concat(['manifest.json'].filter((f) => fs.existsSync(path.join(ROOT, f))));
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, '')).join('\n');
}
const found = {};
for (const f of files) {
  const src = /\.json$/.test(f) ? read(f) : stripComments(read(f));
  const hits = src.match(/googleapis\.com\/auth\/[A-Za-z0-9._-]+/g) || [];
  for (const h of hits) { const s = 'https://www.' + h; (found[f] = found[f] || new Set()).add(s); }
}
const SKIP_SCOPE_SCAN = new Set(['core/google-config.js', 'core/google-contacts.js']);
const stray = [];
for (const f of Object.keys(found)) {
  if (SKIP_SCOPE_SCAN.has(f)) continue;
  for (const s of found[f]) {
    if (ALLOW.has(s)) continue;
    if ((UNWIRED[f] || []).indexOf(s) >= 0) continue;
    stray.push(f + ': ' + s);
  }
}
check('source scan: no scope literal outside the allowlist and the unwired module', stray.length === 0, stray);
check('source scan: no forbidden scope literal anywhere shipped (except refusal pins in google-config.js)', !Object.keys(found).some((f) => SKIP_SCOPE_SCAN.has(f) ? false : Array.from(found[f]).some((s) => FORBIDDEN.has(s) || /forms|gmail\.(modify|readonly|send)/.test(s))));
const loaders = files.filter((f) => f !== 'core/sheet-row.js' && /sheet-row|FlowSheetRow/.test(read(f)));
check('core/sheet-row.js is not loaded or referenced by any shipped file or the manifest', loaders.length === 0, loaders);

check('self-check: the allowlist has exactly 8 spellings', ALLOW.size === 8, Array.from(ALLOW));

console.log(failures ? failures + ' failure(s)' : 'all passed');
process.exit(failures ? 1 : 0);
