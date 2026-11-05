#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { FlowChatRedact } = require('../src/chat-redact.js');
const { FlowChatKillSwitch } = require('../core/chat-kill-switch.js');

const ROOT = path.join(__dirname, '..');
let failed = 0;
function check(name, ok, detail) {
  if (!ok) {
    failed += 1;
    console.error('FAIL:', name, detail || '');
  } else {
    console.log('ok:', name);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const optional = manifest.optional_host_permissions || [];
const blob = JSON.stringify(manifest);
check('built manifest has no business.facebook.com', blob.indexOf('business.facebook.com') < 0);
check('manifest has activeTab', (manifest.permissions || []).indexOf('activeTab') >= 0);
check('manifest has glance-read-chat command', Boolean(manifest.commands && manifest.commands['glance-read-chat']));

const messengerSrc = fs.readFileSync(path.join(ROOT, 'src/content-messenger.js'), 'utf8');
const instagramSrc = fs.readFileSync(path.join(ROOT, 'src/content-instagram.js'), 'utf8');
check('Messenger has no MutationObserver', messengerSrc.indexOf('new MutationObserver') < 0);
check('Instagram has no MutationObserver', instagramSrc.indexOf('new MutationObserver') < 0);
check('Messenger exposes runUserRead', /runUserRead/.test(messengerSrc));

const redacted = FlowChatRedact.redactText('Dana sent ₪1,200 for policy ABC-12345', ['Dana']);
check('redaction masks name and amount', redacted.indexOf('Dana') < 0 && redacted.indexOf('₪') < 0 && redacted.indexOf('[amount]') >= 0 && redacted.indexOf('[name]') >= 0);

check('kill switch defaults remote messenger off', FlowChatKillSwitch.remoteOff({}, 'messenger') === true);
check('kill switch opens when remote false', FlowChatKillSwitch.remoteOff({ 'glanceChatRemoteKill.messenger': false }, 'messenger') === false);

if (failed) process.exit(1);
console.log('\nAll messenger on-demand corpus checks passed.');
