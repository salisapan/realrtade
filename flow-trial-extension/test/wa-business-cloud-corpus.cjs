#!/usr/bin/env node
// W4 WhatsApp Business Cloud: webhook fixtures, signature, idempotency, kill switch, never-send.
// Run: node flow-trial-extension/test/wa-business-cloud-corpus.cjs

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SHARED = path.join(__dirname, '../../supabase/functions/_shared/wa-cloud-logic.js');
const {
  verifyHubSignature,
  nodeHmacSha256,
  parseInboundMessages,
  storeInboundMessages,
  verifyTokenHandshake,
} = require(SHARED);

const { FlowWaBusinessLane } = require(path.join(ROOT, 'core/wa-business-lane.js'));
const { FlowWaBusinessRedact } = require(path.join(ROOT, 'core/wa-business-redact.js'));
const swSrc = fs.readFileSync(path.join(ROOT, 'src/wa-business-sw.js'), 'utf8');
const cardSrc = fs.readFileSync(path.join(ROOT, 'src/wa-business-card.js'), 'utf8');
const hostSrc = fs.readFileSync(path.join(ROOT, 'src/wa-business-host.js'), 'utf8');
const bgSrc = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');

let failures = 0;
function check(name, ok, detail) {
  if (!ok) {
    failures += 1;
    console.error('FAIL:', name, detail || '');
  } else {
    console.log('ok:', name);
  }
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/wa-meta', name), 'utf8'));
}

(async () => {
  const secret = 'test-app-secret-not-real';
  const body = JSON.stringify(loadFixture('text.json'));
  const mac = nodeHmacSha256('SHA-256', Buffer.from(body), Buffer.from(secret));
  const sig = 'sha256=' + mac.toString('hex');
  check('signature valid', await verifyHubSignature(body, sig, secret, nodeHmacSha256));
  check('signature failure -> reject', !(await verifyHubSignature(body, 'sha256=' + '0'.repeat(64), secret, nodeHmacSha256)));

  const parsedText = parseInboundMessages(loadFixture('text.json'));
  check('text fixture parses one message', parsedText.length === 1 && parsedText[0].wamid === 'wamid.TEXT_FIXTURE_1');
  const parsedImg = parseInboundMessages(loadFixture('image-caption.json'));
  check('image caption kept', parsedImg[0].caption.indexOf('policy') >= 0);
  const parsedDoc = parseInboundMessages(loadFixture('document.json'));
  check('document filename kept', parsedDoc[0].filename === 'invoice-204.pdf');
  const parsedHe = parseInboundMessages(loadFixture('hebrew-text.json'));
  check('hebrew text body', /תשלח/.test(parsedHe[0].textBody));

  const store = { _s: new Set(), has(w) { return this._s.has(w); }, add(r) { this._s.add(r.wamid); } };
  const first = storeInboundMessages(parsedText, store, { globalKill: false });
  const replay = storeInboundMessages(parsedText, store, { globalKill: false });
  check('replay -> no duplicate', first.inserted === 1 && replay.duplicates === 1 && replay.inserted === 0);
  const killed = storeInboundMessages(parsedText, { has() { return false; }, add() {} }, { globalKill: true });
  check('global kill -> silence', killed.inserted === 0 && killed.killed === true);

  const hand = verifyTokenHandshake(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '12345' }), 'tok');
  check('verify token handshake', hand.ok && hand.challenge === '12345');
  check('verify token mismatch', !verifyTokenHandshake(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'bad', 'hub.challenge': '1' }), 'tok').ok);

  check('lane off by default', FlowWaBusinessLane.buildEnabled({}, false, false, false) === false);
  check('lane needs labs switch', FlowWaBusinessLane.buildEnabled({ WHATSAPP_BUSINESS: true }, true, false, false) === true);
  check('per-user kill', FlowWaBusinessLane.buildEnabled({ WHATSAPP_BUSINESS: true }, true, true, false) === false);
  check('global kill', FlowWaBusinessLane.buildEnabled({ WHATSAPP_BUSINESS: true }, true, false, true) === false);

  const judged = FlowWaBusinessLane.judgeInbound({
    text_body: 'Please send me the signed contract by Thursday.',
    contact_name: 'Dana',
    message_type: 'text',
  });
  check('inbound ask offers', judged.show === true);

  const masked = FlowWaBusinessRedact.maskForModel('Dana owes 500 NIS policy POL-8844221 id 123456789');
  check('redact amounts and policy/id', masked.maskedText.indexOf('500') < 0 && masked.maskedText.indexOf('POL-8844221') < 0);

  check('never-send: worker source', FlowWaBusinessLane.assertNeverSends(swSrc));
  check('never-send: card source', FlowWaBusinessLane.assertNeverSends(cardSrc));
  check('never-send: host avoids web.whatsapp', !/web\.whatsapp\.com/.test(hostSrc));

  check('background wires wa-business handlers', /flow:wa-business-poll/.test(bgSrc) && /flow:wa-business-save-draft/.test(bgSrc));
  check('WHATSAPP_BUSINESS in labs list', /WHATSAPP_BUSINESS/.test(fs.readFileSync(path.join(ROOT, 'core/labs-switches.js'), 'utf8')));

  const proof = FlowWaBusinessLane.buildProof('draft-1', true);
  check('ProofOfClose fetchedBack', proof && proof.fetchedBack === true && proof.system === 'whatsapp/business-draft');

  console.log('\n' + (failures ? failures + ' FAILED' : 'All wa-business-cloud checks passed'));
  process.exit(failures ? 1 : 0);
})();
