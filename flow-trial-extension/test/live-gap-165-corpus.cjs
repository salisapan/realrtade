// The pure pieces behind the live-gap fixes of PR #165: which Google account a
// write may use, when a step counts as verified, when a 401 is the token's
// fault, how a half-done receipt reads in Hebrew, and how a build is stamped.
// Run: node test/live-gap-165-corpus.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const EXT = path.join(__dirname, '..');
const REPO = path.join(EXT, '..');
let failed = 0;
function check(name, ok, detail) {
  if (ok) { console.log('PASS:', name); return; }
  failed++;
  console.log('FAIL:', name, detail === undefined ? '' : JSON.stringify(detail));
}

const sandbox = { module: undefined, console, URL };
vm.createContext(sandbox);
for (const f of ['google-config.js', 'google-account.js', 'proof-of-close.js', 'display-copy.js']) {
  vm.runInContext(fs.readFileSync(path.join(EXT, 'core', f), 'utf8'), sandbox, { filename: f });
}
const Account = vm.runInContext('FlowGoogleAccount', sandbox);
const Cfg = vm.runInContext('FlowGoogleConfig', sandbox);
const Proof = vm.runInContext('FlowProofOfClose', sandbox);
const Display = vm.runInContext('FlowDisplay', sandbox);

console.log('\n--- which account a write may use ---\n');
const stored = { token: 'ya29.stored', source: 'web', email: 'me@gmail.com' };
const chrome = { token: 'ya29.chrome', source: 'chrome', email: 'other@gmail.com' };
check('the consented account wins over a Chrome token of another account', Account.choose('me@gmail.com', [stored, chrome]).token === 'ya29.stored');
check('a Chrome token of another account alone is refused and names both addresses', (() => {
  const r = Account.choose('me@gmail.com', [chrome]);
  return r.ok === false && r.reason === 'wrong-account' && r.connected === 'me@gmail.com' && r.found[0] === 'other@gmail.com' && /other@gmail.com/.test(Account.refusalLine(r, 'en')) && /me@gmail.com/.test(Account.refusalLine(r, 'he'));
})());
check('no record yet but the tab account matches the token: the match is adopted', (() => {
  const r = Account.choose('', [chrome, stored], 'me@gmail.com');
  return r.ok === true && r.token === 'ya29.stored' && r.adopt === true;
})());
check('no record and no tab account: nothing to match against, so no write', (() => {
  const r = Account.choose('', [chrome, stored]);
  return r.ok === false && r.reason === 'account-unverified' && r.why === 'no-account';
})());
check('an unreadable profile is never a match: no write, account-unverified', (() => {
  const r = Account.choose('me@gmail.com', [{ token: 'ya29.x', source: 'web', email: '' }]);
  return r.ok === false && r.reason === 'account-unverified' && r.why === 'profile-unreadable' && r.tab === 'me@gmail.com';
})());
check('an unreadable token next to a matching one: the matching one is used', (() => {
  const r = Account.choose('me@gmail.com', [{ token: 'ya29.x', source: 'web', email: '' }, stored]);
  return r.ok === true && r.token === 'ya29.stored';
})());
check('the unverified line is Hebrew in the Hebrew UI and English otherwise', (() => {
  const r = Account.choose('me@gmail.com', [{ token: 'ya29.x', source: 'web', email: '' }]);
  return /לא הצלחתי לאמת את החשבון — יש להתחבר מחדש/.test(Account.refusalLine(r, 'he')) && /verify the account/.test(Account.refusalLine(r, 'en'));
})());
check('no token at all is no-token', Account.choose('me@gmail.com', []).reason === 'no-token');
check('bidi marks and case do not make two addresses different', Account.same('\u200eMe@Gmail.com', 'me@gmail.com') === true);
check('a profile without an address is no address', Account.emailOfProfile({ messagesTotal: 4 }) === '' && Account.emailOfProfile({ emailAddress: 'A@B.co' }) === 'a@b.co');

console.log('\n--- a step is verified only by a read-back of its own id ---\n');
const proof = { system: 'google/tasks', externalId: 't1', fetchedBack: true, verifiedAt: '2026-10-18T09:00:00.000Z' };
check('ok with a proof naming the created id is verified', Proof.laneStepVerified({ ok: true, ref: { externalId: 't1' }, proof: proof }) === true);
check('ok alone is a claim, not a close', Proof.laneStepVerified({ ok: true }) === false);
check('a proof for another id is not verified', Proof.laneStepVerified({ ok: true, ref: { externalId: 't2' }, proof: proof }) === false);
check('a skipped step is not verified', Proof.laneStepVerified({ ok: true, skipped: true, ref: { externalId: 't1' }, proof: proof }) === false);
check('a failed write with a ref is not verified', Proof.laneStepVerified({ ok: false, ref: { externalId: 't1' }, proof: proof }) === false);

console.log('\n--- a 401 is the token\'s fault only from the APIs a card writes to ---\n');
['https://tasks.googleapis.com/tasks/v1/lists/x/tasks', 'https://www.googleapis.com/calendar/v3/calendars/primary/events', 'https://www.googleapis.com/drive/v3/files/x',
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', 'https://gmail.googleapis.com/gmail/v1/users/me/drafts', 'https://docs.googleapis.com/v1/documents/x', 'https://sheets.googleapis.com/v4/spreadsheets/x'
].forEach((u) => check('critical: ' + u, Cfg.isCriticalUrl(u) === true));
['https://people.googleapis.com/v1/people:searchContacts', 'https://www.googleapis.com/oauth2/v2/userinfo', 'https://example.com/', 'not a url', ''].forEach((u) => check('not critical: ' + u, Cfg.isCriticalUrl(u) === false));
check('the contacts scope is not on the allowlist', !Cfg.SCOPES.some((s) => /contacts/.test(s)));

console.log('\n--- a half-done receipt reads in Hebrew ---\n');
check('Partly done names what was done, in Hebrew', /^בוצע חלקית — /.test(Display.showChrome('he', 'Partly done — set a reminder.')), Display.showChrome('he', 'Partly done — set a reminder.'));
check('Partly done stays English in an English UI', Display.showChrome('en', 'Partly done — set a reminder.') === 'Partly done — set a reminder.');

console.log('\n--- a build is stamped with its commit, and only the stamp changes ---\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-stamp-'));
for (const rel of ['manifest.json', 'core/build-stamp.js']) {
  fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
  fs.copyFileSync(path.join(EXT, rel), path.join(tmp, rel));
}
const before = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const run = spawnSync('python3', [path.join(REPO, 'scripts', 'stamp_build.py'), '--root', tmp, '--sha', 'abc1234'], { encoding: 'utf8' });
check('stamp_build.py runs', run.status === 0, run.stderr);
const after = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
check('version_name is <version>+<sha7>', after.version_name === before.version + '+abc1234', after.version_name);
check('version itself is untouched', after.version === before.version);
const rest = (m) => JSON.stringify(Object.assign({}, m, { version_name: undefined }));
check('nothing else in the manifest changed', rest(after) === rest(before));
const stampJs = fs.readFileSync(path.join(tmp, 'core', 'build-stamp.js'), 'utf8');
const logged = [];
const ctx = { console: { log: (line) => logged.push(line) }, globalThis: null };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(stampJs, ctx);
check('FlowBuild.STAMP is the sha7', ctx.FlowBuild && ctx.FlowBuild.STAMP === 'abc1234');
check('the console line is "Glance build <sha7>"', logged.indexOf('Glance build abc1234') >= 0, logged);
check('the committed tree carries no version_name and no sha', before.version_name === undefined && /const STAMP = '[\d.]+'/.test(fs.readFileSync(path.join(EXT, 'core', 'build-stamp.js'), 'utf8')));
const bad = spawnSync('python3', [path.join(REPO, 'scripts', 'stamp_build.py'), '--root', tmp, '--sha', "x'; alert(1)"], { encoding: 'utf8' });
check('a stamp that is not a short sha is refused', bad.status !== 0);

if (failed) { console.log('\nTOTAL FAILURES:', failed); process.exit(1); }
console.log('\nTOTAL FAILURES: 0');
