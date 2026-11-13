'use strict';
// Official Meta messaging: webhook signature, fixtures, send only after approval, read-back, no unsend.
// Run: node test/meta-official-messaging-corpus.cjs
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { FlowMetaOfficial: M } = require('../core/meta-official-messaging.js');
const fn = require('../../flow-landing/netlify/functions/meta-official-messaging/meta-official-messaging.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');
const FIX = path.join(__dirname, 'fixtures', 'meta');
const SECRET = 'test-app-secret';
const RELAY = 'relay-secret-at-least-16';
const TOKEN = 'page-token-not-in-the-url';
const NOW = 1710000005000;

function sign(raw) {
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
}
function readFix(name) {
  return fs.readFileSync(path.join(FIX, name));
}
function env(extra) {
  return Object.assign({
    GLANCE_META_OFFICIAL: '1',
    META_APP_SECRET: SECRET,
    META_VERIFY_TOKEN: 'verify-token',
    META_PAGE_ACCESS_TOKEN: TOKEN,
    GLANCE_META_READ_SECRET: RELAY,
    META_GRAPH_VERSION: 'v21.0'
  }, extra || {});
}
function callsOf() {
  const calls = [];
  const http = async (url, init) => {
    calls.push({ url: url, init: init });
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (init && init.method === 'POST') {
      return { ok: true, status: 200, json: { recipient_id: '2222222222', message_id: 'mid.sent-1' } };
    }
    return { ok: true, status: 200, json: { id: 'mid.sent-1', message: body ? '' : 'קיבלתי. אבדוק ואחזור אליך.' } };
  };
  return { calls: calls, http: http };
}

console.log('--- signature ---');
const messengerRaw = readFix('messenger-message.json');
const good = sign(messengerRaw);
check('fixture signature verifies', M.verifySignature(messengerRaw, good, SECRET) === true);
check('a changed body fails', M.verifySignature(Buffer.concat([messengerRaw, Buffer.from(' ')]), good, SECRET) === false);
check('a wrong secret fails', M.verifySignature(messengerRaw, good, 'other-secret') === false);
check('a missing header fails', M.verifySignature(messengerRaw, '', SECRET) === false);
check('sha1 is not accepted', M.verifySignature(messengerRaw, 'sha1=' + crypto.createHmac('sha1', SECRET).update(messengerRaw).digest('hex'), SECRET) === false);
check('re-serialized JSON is not the signed body', M.verifySignature(JSON.stringify(JSON.parse(messengerRaw.toString('utf8'))), good, SECRET) === false);
check('an empty secret never verifies', M.verifySignature(messengerRaw, good, '') === false);

console.log('--- fixtures ---');
const messenger = M.parseWebhook(messengerRaw);
check('messenger fixture is one Hebrew ask', messenger.ok === true && messenger.items.length === 1 && messenger.items[0].channel === 'messenger' && messenger.items[0].lang === 'he' && messenger.items[0].senderId === '2222222222');
const instagram = M.parseWebhook(readFix('instagram-message.json'));
check('instagram fixture is one English ask', instagram.ok === true && instagram.items.length === 1 && instagram.items[0].channel === 'instagram' && instagram.items[0].lang === 'en' && /invoice/.test(instagram.items[0].text));
check('an echo is not an inbound ask', M.parseWebhook(readFix('messenger-echo.json')).items.length === 0);
check('a delivery receipt is quiet', M.parseWebhook(readFix('messenger-delivery.json')).items.length === 0);
check('thanks with no ask is quiet', M.parseWebhook({ object: 'page', entry: [{ id: '1111111111', messaging: [{ sender: { id: '2222222222' }, recipient: { id: '1111111111' }, timestamp: NOW, message: { mid: 'mid.thanks', text: 'thanks' } }] }] }).items.length === 0);
check('the server flag is off unless it is exactly 1', M.serverOn({}) === false && M.serverOn({ GLANCE_META_OFFICIAL: 'true' }) === false && M.serverOn({ GLANCE_META_OFFICIAL: '1' }) === true);
check('the extension switch is off unless true', M.switchOn({}) === false && M.switchOn({ META_OFFICIAL_MESSAGING: 'yes' }) === false && M.switchOn({ META_OFFICIAL_MESSAGING: true }) === true);

console.log('--- challenge and webhook handler ---');
(async () => {
  const off = await fn.handle({ httpMethod: 'POST', body: messengerRaw.toString('utf8'), headers: { 'X-Hub-Signature-256': good } }, { env: { GLANCE_META_OFFICIAL: '' } });
  check('flag off answers 404 and does not accept the webhook', off.statusCode === 404);

  const badSig = await fn.handle({
    httpMethod: 'POST',
    body: messengerRaw.toString('utf8'),
    headers: { 'X-Hub-Signature-256': sign(Buffer.from('nope')) }
  }, { env: env() });
  check('a bad signature is 403', badSig.statusCode === 403);

  let accepted = null;
  const okHook = await fn.handle({
    httpMethod: 'POST',
    body: messengerRaw.toString('utf8'),
    headers: { 'X-Hub-Signature-256': good }
  }, { env: env(), onAccepted: (items) => { accepted = items; } });
  check('a signed webhook is 200 and keeps the text out of the response', okHook.statusCode === 200 && okHook.body.indexOf('חשבונית') < 0 && accepted && accepted.length === 1);

  const challenge = await fn.handle({
    httpMethod: 'GET',
    queryStringParameters: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-token', 'hub.challenge': 'challenge-1' }
  }, { env: env() });
  check('the matching verify token echoes the challenge', challenge.statusCode === 200 && challenge.body === 'challenge-1');
  const wrong = await fn.handle({
    httpMethod: 'GET',
    queryStringParameters: { 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': 'challenge-1' }
  }, { env: env() });
  check('a wrong verify token does not echo the challenge', wrong.statusCode === 403 && wrong.body === '');

  console.log('--- send only after approval, then read back ---');
  const bag = callsOf();
  const input = {
    approved: true,
    enabled: true,
    channel: 'messenger',
    pageId: '1111111111',
    recipientId: '2222222222',
    text: 'קיבלתי. אבדוק ואחזור אליך.',
    timestamp: NOW - 1000,
    messageId: 'mid.messenger-ask',
    token: TOKEN,
    version: 'v21.0'
  };
  const refused = await M.sendApproved(Object.assign({}, input, { approved: false }), bag.http, { now: NOW, seen: new Map() });
  check('without approval nothing is sent', refused.reason === 'not-approved' && bag.calls.length === 0);
  const sent = await M.sendApproved(input, bag.http, { now: NOW, seen: new Map() });
  check('an approved reply is posted to graph.facebook.com and Handled only when read back', sent.ok === true && sent.proof.fetchedBack === true && sent.proof.system === 'meta/messenger' && sent.proof.externalId === 'mid.sent-1');
  check('the token stays out of the URL', bag.calls.length === 2 && bag.calls[0].url === 'https://graph.facebook.com/v21.0/1111111111/messages' && bag.calls[0].url.indexOf(TOKEN) < 0 && bag.calls[0].init.headers.Authorization === 'Bearer ' + TOKEN);
  check('the posted text is the approved text', JSON.parse(bag.calls[0].init.body).message.text === input.text && JSON.parse(bag.calls[0].init.body).messaging_type === 'RESPONSE');

  const stale = callsOf();
  const old = await M.sendApproved(input, stale.http, { now: NOW + 25 * 60 * 60 * 1000, seen: new Map() });
  check('outside the 24 hour window nothing is sent', old.reason === 'window' && stale.calls.length === 0);

  const evil = M.sendRequest({ channel: 'messenger', version: 'v21.0', pageId: '12345/../evil', recipientId: '2222222222', text: 'hi', token: TOKEN });
  check('a page id cannot change the host', evil.ok === false);
  check('only graph.facebook.com is allowed', M.allowedGraphUrl('https://graph.facebook.com/v21.0/1') === true && M.allowedGraphUrl('https://evil.example/v21.0/1') === false && M.allowedGraphUrl('http://graph.facebook.com/v21.0/1') === false);

  const mismatchHttp = async (url, init) => {
    if (init && init.method === 'POST') return { ok: true, status: 200, json: { message_id: 'mid.sent-2' } };
    return { ok: true, status: 200, json: { id: 'mid.sent-2', message: 'something else' } };
  };
  const memory = new Map();
  const missed = await M.sendApproved(Object.assign({}, input, { messageId: 'mid.other' }), mismatchHttp, { now: NOW, seen: memory });
  const again = await M.sendApproved(Object.assign({}, input, { messageId: 'mid.other' }), mismatchHttp, { now: NOW, seen: memory });
  check('a read-back that disagrees is not Handled', missed.ok === false && missed.reason === 'unverified' && missed.proof == null);
  check('a failed read-back is not sent a second time', again === missed);

  const undo = M.undo();
  check('undo says Meta cannot take the message back', undo.ok === false && undo.reason === 'no-unsend' && /לא נותנת לבטל/.test(undo.he));

  let posts = 0;
  let igBody = null;
  const text = 'Can you send me the invoice?';
  const http2 = async (url, init) => {
    if (init && init.method === 'POST') {
      posts += 1;
      igBody = JSON.parse(init.body);
      return { ok: true, status: 200, json: { message_id: 'mid.sent-ig' } };
    }
    return { ok: true, status: 200, json: { id: 'mid.sent-ig', message: text } };
  };
  const ig = await M.sendApproved({
    approved: true,
    enabled: true,
    channel: 'instagram',
    pageId: '3333333333',
    recipientId: '4444444444',
    text: text,
    timestamp: NOW - 1000,
    messageId: 'mid.instagram-ask',
    token: TOKEN,
    version: 'v21.0'
  }, http2, { now: NOW, seen: new Map() });
  check('instagram send has no messaging_type and is read back', ig.ok === true && ig.proof.system === 'meta/instagram' && posts === 1 && igBody && igBody.messaging_type == null && igBody.message.text === text);

  console.log('--- the function refuses a send the person did not approve ---');
  const sendEvent = (body, relay) => ({
    httpMethod: 'POST',
    headers: { 'X-Glance-Meta-Action': 'send', 'X-Glance-Meta-Relay': relay || RELAY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = {
    approved: true,
    channel: 'messenger',
    pageId: '1111111111',
    recipientId: '2222222222',
    text: 'קיבלתי. אבדוק ואחזור אליך.',
    timestamp: NOW - 1000,
    messageId: 'mid.fn-1'
  };
  let fnPosts = 0;
  const fnHttp = async (url, init) => {
    if (init.method === 'POST') fnPosts += 1;
    if (init.method === 'POST') return { ok: true, status: 200, json: { message_id: 'mid.fn-sent' } };
    return { ok: true, status: 200, json: { message: payload.text } };
  };
  const noClick = await fn.handle(sendEvent(Object.assign({}, payload, { approved: false }), RELAY), { env: env(), http: fnHttp, now: NOW, seen: new Map() });
  check('approved false does not call Graph', noClick.statusCode === 200 && JSON.parse(noClick.body).reason === 'not-approved' && fnPosts === 0);
  const noRelay = await fn.handle(sendEvent(payload, 'short'), { env: env(), http: fnHttp, now: NOW, seen: new Map() });
  check('a missing relay secret is not authorized', noRelay.statusCode === 401 && fnPosts === 0);
  const noToken = await fn.handle(sendEvent(payload), { env: env({ META_PAGE_ACCESS_TOKEN: '' }), http: fnHttp, now: NOW, seen: new Map() });
  check('no page token does not call Graph', JSON.parse(noToken.body).reason === 'not-configured' && fnPosts === 0);
  const did = await fn.handle(sendEvent(payload), { env: env(), http: fnHttp, now: NOW, seen: new Map() });
  const proof = JSON.parse(did.body);
  check('the function sends once and returns fetchedBack', proof.ok === true && proof.proof.fetchedBack === true && proof.proof.externalId === 'mid.fn-sent' && fnPosts === 1 && did.body.indexOf(TOKEN) < 0);

  console.log('--- the extension stays off the Graph host and the page lanes ---');
  const bg = fs.readFileSync(path.join(ROOT, 'src', 'background.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
  const card = fs.readFileSync(path.join(ROOT, 'src', 'meta-official-card.js'), 'utf8');
  check('the worker asks the off switch before a send', /glanceSwitchOn\('META_OFFICIAL_MESSAGING'\)/.test(bg));
  check('the worker does not call graph.facebook.com', bg.indexOf('graph.facebook.com') < 0);
  check('the manifest gains no Facebook host', !/facebook\.com|graph\.facebook/.test(manifest));
  check('the card does not read messenger.com or instagram.com', !/messenger\.com|instagram\.com|MutationObserver/.test(card));
  check('labs lists the switch', /META_OFFICIAL_MESSAGING/.test(fs.readFileSync(path.join(ROOT, 'core', 'labs-switches.js'), 'utf8')));

  console.log(failures ? 'TOTAL FAILURES: ' + failures : 'TOTAL FAILURES: 0');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
