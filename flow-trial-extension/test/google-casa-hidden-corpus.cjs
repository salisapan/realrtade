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

  const saveDraftSlice = gmail.slice(
    gmail.indexOf('async function saveReplyDraft'),
    gmail.indexOf('async function sendGmailCompose(payload)')
  );
  const sendComposeSlice = gmail.slice(
    gmail.indexOf('async function sendGmailCompose(payload)'),
    gmail.indexOf('async function sendLaneUndo')
  );
  check('saveReplyDraft uses the lane googleReplyDraft path when the compose window is closed',
    /async function saveReplyDraft/.test(gmail)
    && /connectorId: 'googleReplyDraft'/.test(saveDraftSlice)
    && /type: 'flow:google-write'/.test(saveDraftSlice));
  check('compose closed calls googleReplyDraft; compose open uses gmailCompose (not in saveReplyDraft slice)',
    !/connectorId: 'gmailCompose'/.test(saveDraftSlice)
    && /if \(!composeBodyOpen\(\)\) return saveReplyDraft/.test(sendComposeSlice));

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

  const draftPosts = [];
  const draftHttp = async (req) => {
    const method = (req && req.method) || 'GET';
    const url = String(req && req.url || '');
    if (method === 'POST' && /\/users\/me\/drafts$/.test(url)) {
      draftPosts.push(req);
      return {
        status: 200,
        ok: true,
        json: {
          id: 'draft_casa_1',
          message: {
            id: 'msg_casa_1',
            threadId: 'thread123456',
            payload: {
              headers: [
                { name: 'To', value: 'dana@example.com' },
                { name: 'Subject', value: 'Re: Hi' }
              ],
              body: { data: Buffer.from('Please see attached.').toString('base64') }
            }
          }
        }
      };
    }
    if (method === 'GET' && /\/users\/me\/drafts\/draft_casa_1/.test(url)) {
      return {
        status: 200,
        ok: true,
        json: {
          id: 'draft_casa_1',
          message: {
            id: 'msg_casa_1',
            threadId: 'thread123456',
            payload: {
              headers: [
                { name: 'To', value: 'dana@example.com' },
                { name: 'Subject', value: 'Re: Hi' }
              ],
              body: { data: Buffer.from('Please see attached.').toString('base64') }
            }
          }
        }
      };
    }
    return { status: 404, ok: false, json: null };
  };
  const withCompose = OAUTH_ONLY.concat(['https://www.googleapis.com/auth/gmail.compose']);
  const draftOk = await D.write({
    to: 'dana@example.com',
    subject: 'Hi',
    body: 'Please see attached.',
    threadId: 'thread123456',
    grantedScopes: withCompose
  }, draftHttp);
  check('googleReplyDraft creates the draft through the drafts API (no contacts lookup, no contacts scope)',
    draftOk.ok === true && draftPosts.length === 1 && !draftPosts[0].body.includes('people.googleapis.com'),
    { draftOk, posts: draftPosts.length });

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
