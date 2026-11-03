#!/usr/bin/env node
// Outlook add-in bundle smoke tests (no Office host).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const bundle = path.join(root, 'dist', 'core-bundle.js');
let failures = 0;

function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

if (!fs.existsSync(bundle)) {
  require('../scripts/build-bundle.js');
}

const sandbox = { console, module: undefined };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(bundle, 'utf8'), sandbox, { filename: 'core-bundle.js' });

const judge = sandbox.GlanceOutlookEngine.judge;
const draftText = sandbox.GlanceOutlookEngine.draftText;
const NOW = new Date('2026-10-15T12:00:00Z');

{
  const judged = judge({
    text: 'Could we meet Thursday at 3pm?',
    subject: 'Thursday',
    sender: { email: 'dana@example.com', name: 'Dana' },
    to: ['me@example.com'],
    ownAddresses: ['me@example.com'],
    now: NOW,
    surface: 'outlook',
    attachmentCount: 0
  });
  check('outlook surface offers an explicit calendar hold', judged && judged.show === true && judged.process && judged.process.id === 'hold', judged && judged.process && judged.process.id);
}
{
  const gmail = judge({
    text: 'Please send me the report by Friday.',
    subject: 'Report',
    sender: { email: 'dana@example.com', name: 'Dana' },
    to: ['me@example.com'],
    ownAddresses: ['me@example.com'],
    now: NOW,
    surface: 'gmail',
    attachmentCount: 0
  });
  check('shared engine still plans reply drafts on gmail', gmail && gmail.show && gmail.process && gmail.process.id === 'reply-track', gmail && gmail.process && gmail.process.id);
  const body = draftText(gmail.process, { sender: { email: 'dana@example.com', name: 'Dana' }, subject: 'Report' });
  check('draft text is non-empty and never claims sent', body && body.indexOf('Not sent') === -1 && body.length > 10, body && body.slice(0, 40));
}

{
  const manifest = fs.readFileSync(path.join(root, 'manifest.xml'), 'utf8');
  check('manifest declares Mailbox 1.5', manifest.indexOf('MinVersion="1.5"') !== -1);
  check('manifest has mobile read command surface', manifest.indexOf('MobileMessageReadCommandSurface') !== -1);
  check('manifest does not register OnNewMessageCompose (no write without a click)', manifest.indexOf('OnNewMessageCompose') === -1);
  check('manifest is add-in only (MailApp)', manifest.indexOf('xsi:type="MailApp"') !== -1);
}

{
  // The ready bundle: every URL the manifest points at is a file in dist/site, and the pane's script tags resolve.
  require('../scripts/pack.js');
  const site = path.join(root, 'dist', 'site');
  const manifest = fs.readFileSync(path.join(root, 'manifest.xml'), 'utf8');
  const urls = (manifest.match(/https:\/\/theflow-ai\.com\/glance-outlook-addin\/[^"<]+/g) || []);
  const missing = urls.filter((u) => !fs.existsSync(path.join(site, u.replace('https://theflow-ai.com/', ''))));
  check('pack: manifest has hosted URLs and each is in the bundle', urls.length > 0 && missing.length === 0, missing);
  const html = fs.readFileSync(path.join(site, 'glance-outlook-addin', 'src', 'taskpane.html'), 'utf8');
  const local = (html.match(/(?:src|href)="(?!https?:)([^"]+)"/g) || []).map((m) => m.replace(/^(?:src|href)="|"$/g, ''));
  const gone = local.filter((r) => !fs.existsSync(path.join(site, 'glance-outlook-addin', 'src', r)));
  check('pack: every local script and style in taskpane.html is in the bundle', local.length >= 3 && gone.length === 0, gone);
  check('pack: checksums written', fs.existsSync(path.join(site, 'glance-outlook-addin', 'SHA256SUMS')));
}

if (failures) {
  console.error('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nAll outlook add-in checks passed');
