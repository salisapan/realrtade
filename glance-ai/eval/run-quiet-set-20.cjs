// Runs glance-ai/eval/quiet-set-20.json through FlowIncomingJudge.judge
// in a Node vm, the same way flow-trial-extension/test/*-corpus.cjs loads core/.
// Synthetic labels. Not owner gold. A quiet row that shows is a wrong offer.
// Run: node glance-ai/eval/run-quiet-set-20.cjs
//      node glance-ai/eval/run-quiet-set-20.cjs --fail-on-wrong-offer
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..', '..');
const ROOT = path.join(REPO, 'flow-trial-extension');
const set = JSON.parse(fs.readFileSync(path.join(__dirname, 'quiet-set-20.json'), 'utf8'));
const when = Date.parse(set.judgeNow);

const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'source-text.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'quiet-metrics.js', 'incoming-judge.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const Judge = vm.runInContext('FlowIncomingJudge', engine);

function emails(list) {
  return (list || []).map((p) => (p && p.email) || '').filter(Boolean);
}

const rows = [];
let wrongOffers = 0;
let missedOffers = 0;
for (const mail of set.mails) {
  const r = Judge.judge({
    text: mail.body,
    subject: mail.subject,
    sender: { name: mail.from.name, email: mail.from.email },
    surface: 'outlook',
    to: emails(mail.to),
    cc: emails(mail.cc),
    ownAddresses: [set.user.email],
    userName: set.user.name,
    inbound: true,
    now: when
  });
  const show = r && r.show === true;
  const reason = (r && r.reason) || null;
  const type = r && r.intent && r.intent.type || null;
  const label = r && r.intent && r.intent.label || null;
  const kinds = r && r.process && r.process.steps ? r.process.steps.map((s) => s.kind) : [];
  const wrongOffer = mail.expected === 'quiet' && show;
  const missedOffer = mail.expected === 'offer' && !show;
  if (wrongOffer) wrongOffers += 1;
  if (missedOffer) missedOffers += 1;
  rows.push({ id: mail.id, expected: mail.expected, show, reason, type, label, kinds, wrongOffer, missedOffer });
  const flag = wrongOffer ? 'WRONG OFFER' : (missedOffer ? 'MISSED OFFER' : 'ok');
  console.log(flag + '\t' + mail.id + '\texpected=' + mail.expected + '\tshow=' + show + '\treason=' + (reason || '') + '\ttype=' + (type || '') + '\tkinds=' + kinds.join(','));
}

console.log('wrong offers ' + wrongOffers + ', missed offers ' + missedOffers + ', of ' + rows.length);
if (process.argv.indexOf('--fail-on-wrong-offer') >= 0 && wrongOffers > 0) process.exit(2);
