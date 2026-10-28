// Scope allowlist. Every OAuth scope the extension declares or requests must be on the final allowlist,
// and no restricted scope may appear. Fails on forms.body, gmail.modify or any other scope outside the list.
// Run: node test/scope-allowlist-corpus.cjs   (plain node, no dependencies)
//
// Lists checked:
//   1. manifest.json oauth2.scopes
//   2. core/google-config.js SCOPES (the lane allowlist) and what its assertAllowed refuses
//   3. src/google-web-auth.js GOOGLE_OAUTH_SCOPES (the scopes the web sign-in requests)
//   4. e2e/support/launch.js granted-scope fixture
//   5. every scope literal in the shipped source (core, src, popup, picker, lane-chat, config, background),
//      comments excluded
//
// FINAL ALLOWLIST (CTO ruling 2026-10-28): calendar.events, tasks, contacts.readonly, drive.file, openid,
// userinfo.profile, email (the userinfo.email form is the same scope). `profile` is the short form of
// userinfo.profile and is accepted for the same reason.
//
// LEGACY DEBT, frozen: gmail.compose and drive.readonly are already in the manifest and in the web sign-in
// list on the base branch, and they are NOT on the final allowlist. This test does not hide them: it prints
// them as DEBT, pins the exact set, and fails if the set grows or if any other scope leaves the allowlist.
// Removing them is a separate decision and a separate change; when it is done, empty LEGACY_DEBT and the
// test becomes a strict allowlist.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const G = 'https://www.googleapis.com/auth/';

const ALLOW = new Set([
  G + 'calendar.events', G + 'tasks', G + 'contacts.readonly', G + 'drive.file',
  'openid', G + 'userinfo.profile', G + 'userinfo.email', 'email', 'profile'
]);
const LEGACY_DEBT = Object.freeze([G + 'gmail.compose', G + 'drive.readonly']);
const DEBT = new Set(LEGACY_DEBT);
// A scope that Google classes as restricted, or that reads or writes wider than the allowlist.
const RESTRICTED = [
  /\/auth\/gmail(\.|$)/, /mail\.google\.com/, /\/auth\/drive$/, /\/auth\/drive\.(readonly|metadata|metadata\.readonly|appdata|photos\.readonly|scripts|activity|activity\.readonly)$/,
  /\/auth\/spreadsheets/, /\/auth\/documents/, /\/auth\/forms/, /\/auth\/contacts$/, /\/auth\/calendar$/, /\/auth\/admin/, /\/auth\/cloud-platform/
];
// Shipped but unwired: nothing the extension loads reaches it (proved below), so it requests nothing.
const UNWIRED = { 'core/sheet-row.js': [G + 'spreadsheets'] };

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const isRestricted = (s) => RESTRICTED.some((re) => re.test(s));

function verdict(list) {
  const bad = [];
  const restricted = [];
  const debt = [];
  for (const s of list) {
    if (ALLOW.has(s)) continue;
    if (DEBT.has(s)) { debt.push(s); continue; }
    bad.push(s);
    if (isRestricted(s)) restricted.push(s);
  }
  return { bad, restricted, debt };
}
function audit(name, list) {
  check(name + ': is a non-empty list', Array.isArray(list) && list.length > 0, list);
  const v = verdict(list);
  check(name + ': every scope is on the final allowlist (or the frozen legacy debt)', v.bad.length === 0, v.bad);
  check(name + ': no restricted scope beyond the frozen legacy debt', v.restricted.length === 0, v.restricted);
  check(name + ': no duplicate scope', new Set(list).size === list.length, list);
  for (const d of v.debt) console.log('DEBT:', name, 'still carries', d, '(not on the final allowlist, owner decision pending)');
  return v;
}

// 1. manifest
const man = JSON.parse(read('manifest.json'));
const manScopes = (man.oauth2 && man.oauth2.scopes) || [];
const mv = audit('manifest oauth2.scopes', manScopes);
check('manifest: no Forms scope and no Forms host', !JSON.stringify(man).match(/forms\.body|auth\/forms|forms\.googleapis\.com/));
check('manifest: no gmail scope other than the frozen gmail.compose', manScopes.filter((s) => /gmail|mail\.google/.test(s)).every((s) => s === G + 'gmail.compose'));
check('manifest: host_permissions has no wider Google host than before (no forms, sheets, docs, people hosts)', !(man.host_permissions || []).some((h) => /forms\.googleapis|sheets\.googleapis|docs\.googleapis|people\.googleapis|slides\.googleapis/.test(h)), man.host_permissions);

// 2. lane config
const { FlowGoogleConfig: Cfg } = require(path.join(ROOT, 'core', 'google-config.js'));
audit('google-config SCOPES', Cfg.SCOPES);
for (const s of [G + 'forms.body', G + 'gmail.modify', G + 'gmail.readonly', G + 'gmail.send', G + 'drive', G + 'spreadsheets', G + 'documents', G + 'contacts', G + 'calendar']) {
  check('google-config refuses ' + s.replace(G, ''), Cfg.assertAllowed([s]).ok === false, Cfg.assertAllowed([s]));
}
check('google-config accepts the whole allowlist it carries', Cfg.assertAllowed(Cfg.SCOPES).ok === true);

// 3. web sign-in list
const wa = read('src/google-web-auth.js');
const mm = wa.match(/GOOGLE_OAUTH_SCOPES\s*=\s*\[([\s\S]*?)\]/);
const waScopes = mm ? (mm[1].match(/'[^']+'/g) || []).map((x) => x.slice(1, -1)) : null;
audit('google-web-auth GOOGLE_OAUTH_SCOPES', waScopes);
check('the manifest and the web sign-in ask the same scopes', waScopes && JSON.stringify(waScopes.slice().sort()) === JSON.stringify(manScopes.slice().sort()), { manifest: manScopes, web: waScopes });

// 4. e2e granted-scope fixture
const launch = read('e2e/support/launch.js');
const lm = launch.match(/googleapis\.com\/auth\/[A-Za-z0-9._-]+/g) || [];
audit('e2e launch fixture scopes', Array.from(new Set(lm.map((x) => 'https://www.' + x))));

// 5. every scope literal in shipped source
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
check('source scan reads the shipped files', files.length > 40, files.length);
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, '')).join('\n');
}
const found = {};
for (const f of files) {
  const src = /\.json$/.test(f) ? read(f) : stripComments(read(f));
  const hits = src.match(/googleapis\.com\/auth\/[A-Za-z0-9._-]+/g) || [];
  for (const h of hits) { const s = 'https://www.' + h; (found[f] = found[f] || new Set()).add(s); }
}
const stray = [];
for (const f of Object.keys(found)) {
  for (const s of found[f]) {
    if (ALLOW.has(s) || DEBT.has(s)) continue;
    if ((UNWIRED[f] || []).indexOf(s) >= 0) continue;
    stray.push(f + ': ' + s);
  }
}
check('source scan: no scope literal outside the allowlist, the frozen debt and the unwired module', stray.length === 0, stray);
check('source scan: no scope literal is a restricted one beyond the frozen debt', Object.keys(found).every((f) => Array.from(found[f]).every((s) => !isRestricted(s) || DEBT.has(s) || (UNWIRED[f] || []).indexOf(s) >= 0)));
check('source scan: no forms or gmail.modify literal anywhere shipped', !Object.keys(found).some((f) => Array.from(found[f]).some((s) => /forms|gmail\.(modify|readonly|send|insert|metadata|labels|settings)/.test(s))));
// The one unwired module really is unwired: nothing shipped loads it.
const loaders = files.filter((f) => f !== 'core/sheet-row.js' && /sheet-row|FlowSheetRow/.test(read(f)));
check('core/sheet-row.js is not loaded or referenced by any shipped file or the manifest', loaders.length === 0, loaders);

// The frozen debt can only shrink.
check('legacy debt is exactly {gmail.compose, drive.readonly}', JSON.stringify(LEGACY_DEBT.slice().sort()) === JSON.stringify([G + 'drive.readonly', G + 'gmail.compose']));
const present = LEGACY_DEBT.filter((d) => manScopes.indexOf(d) >= 0 || (waScopes || []).indexOf(d) >= 0);
console.log('INFO: legacy debt still present:', present.map((d) => d.replace(G, '')).join(', ') || 'none');

// Self-check of the classifier, so a loosened ALLOW or RESTRICTED shows up here.
check('self-check: forms.body, gmail.modify, gmail.readonly, drive, spreadsheets are outside', [G + 'forms.body', G + 'gmail.modify', G + 'gmail.readonly', G + 'drive', G + 'spreadsheets'].every((s) => verdict([s]).bad.length === 1 && verdict([s]).restricted.length === 1));
check('self-check: the allowlist has exactly 9 spellings', ALLOW.size === 9, Array.from(ALLOW));

console.log(failures ? failures + ' failure(s)' : 'all passed');
process.exit(failures ? 1 : 0);
