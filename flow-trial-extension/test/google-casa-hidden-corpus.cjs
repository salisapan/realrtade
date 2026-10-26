// CASA scope cut: features that needed gmail.compose or drive.readonly stay
// fully hidden (no chip, card, line, or Do It) when the scope is absent.
// Run: node test/google-casa-hidden-corpus.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
require('../core/google-config.js');
const { FlowCloseChains: C } = require('../core/close-chains.js');
const { FlowGoogleDrafts: D } = require('../core/google-drafts.js');

const OAUTH_ONLY = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

async function run() {
  const gmail = fs.readFileSync(path.join(ROOT, 'src', 'content-gmail.js'), 'utf8');

  const saveDraftSlice = gmail.slice(gmail.indexOf('async function saveReplyDraft'), gmail.indexOf('async function sendGmailCompose'));
  check('saveReplyDraft uses the lane googleReplyDraft path when the compose window is closed',
    /async function saveReplyDraft/.test(gmail)
    && /connectorId: 'googleReplyDraft'/.test(saveDraftSlice)
    && /type: 'flow:google-write'/.test(saveDraftSlice));

  check('mailbox Drive search unavailable is not a why-not-shown line',
    C.searchSilence({ ok: false, reason: 'drive-search-unavailable' }) === null);

  check('content-gmail skips the file chain when mailbox search is unavailable',
    /drive-search-unavailable/.test(gmail) && /recordSilence\(messageId, 'file'\)/.test(gmail));

  const draftBlocked = await D.write({
    to: 'dana@example.com',
    subject: 'Hi',
    body: 'Please see attached.',
    threadId: 'thread123456',
    scopes: OAUTH_ONLY
  }, async () => ({ status: 403, ok: false, json: null }));
  check('googleReplyDraft write without gmail.compose stays hidden (compose-closed, no HTTP)',
    draftBlocked.ok === false && draftBlocked.reason === 'compose-closed');

  const bg = fs.readFileSync(path.join(ROOT, 'src', 'background.js'), 'utf8');
  check('searchDriveFiles gates mailbox search before files.list',
    /mailboxDriveSearchAllowed/.test(bg) && /drive-search-unavailable/.test(bg));

  check('followDraftCreate is gated before any Gmail drafts HTTP',
    /async function followDraftCreate/.test(bg)
    && /gmailComposeApiAllowedNow\(\)/.test(bg.slice(bg.indexOf('async function followDraftCreate'), bg.indexOf('async function followDraftCreate') + 400)));

  check('compose-closed on the page is preview-only (no Handled close)',
    /reason: 'compose-closed'/.test(gmail)
    && /preview: true/.test(gmail.slice(gmail.indexOf('async function saveReplyDraft'), gmail.indexOf('async function saveReplyDraft') + 500))
    && /closes: false/.test(gmail.slice(gmail.indexOf('async function saveReplyDraft'), gmail.indexOf('async function saveReplyDraft') + 500)));

  const outlook = fs.readFileSync(path.join(ROOT, 'src', 'content-outlook.js'), 'utf8');
  check('Outlook runs the file chain before a template close card (driveOk path)',
    /function outlookFileChainNow/.test(outlook)
    && /family === 'I'/.test(outlook)
    && /create-missing/.test(outlook));

  if (failures) {
    console.log('\n' + failures + ' failure(s)');
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

run();
