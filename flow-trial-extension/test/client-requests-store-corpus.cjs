// The client-requests ledger on the device (src/client-requests-store.js), with an in-memory storage stub.
// What is pinned: a pasted request is kept, a client's reply moves only that client's requests, a recurring checklist
// opens once per period, and a reminder recorded moves the next chase day. Run: node test/client-requests-store-corpus.cjs
const { FlowClientRequestStore: S } = require('../src/client-requests-store.js');
let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
(async () => {
  let saved = null;
  const store = S.create({ get: async () => saved, set: async (v) => { saved = JSON.parse(JSON.stringify(v)); } });
  const NOW = new Date('2026-10-11T09:00:00').getTime();
  const r = await store.addFromText({ text: 'שלום דני, נא להעביר דפי בנק לחודשים 7-8/2026 וטופס 106 לשנת 2025.', client: { email: 'Dani@X.co.il', name: 'דני' }, now: NOW });
  check('a pasted request is kept, with its items', r && saved.requests.length === 1 && saved.requests[0].items.length === 2, saved && saved.requests);
  check('the client email is stored lower-case', saved.requests[0].client.email === 'dani@x.co.il');
  const none = await store.addFromText({ text: 'תודה, קיבלתי.', client: { email: 'x@y.z' }, now: NOW });
  check('a message that is not a request is not kept', none === null && saved.requests.length === 1);
  await store.addFromText({ text: 'Please send the signed power of attorney.', client: { email: 'maya@law.co.il' }, now: NOW });
  let ch = await store.ingestIncoming({ messageId: 'm1', from: { email: 'someone@else.com' }, text: '', attachments: [{ name: 'bank_2026-07.pdf', size: 90000 }], fetchedBack: true, now: NOW });
  check('a reply from someone who is not a client moves nothing', ch.length === 0);
  ch = await store.ingestIncoming({ messageId: 'm2', from: { email: 'DANI@x.co.il' }, text: '', attachments: [{ name: 'bank_2026-07.pdf', size: 90000 }, { name: 'bank_2026-08.pdf', size: 90000 }], fetchedBack: true, now: NOW });
  const dani = saved.requests.find((x) => x.client.email === 'dani@x.co.il');
  check("the client's reply moves only that client's request", ch.length === 1 && dani.items[0].status === 'received' && saved.requests.find((x) => x.client.email === 'maya@law.co.il').items[0].status === 'missing');
  const nud = await store.markNudged(dani.id, NOW);
  check('a reminder recorded moves the next chase day and counts it', nud.nudges === 1 && nud.chaseIso > '2026-10-11');
  await store.decide(dani.id, dani.items[1].key, 'received', NOW);
  check('marking the last item received closes the request', saved.requests.find((x) => x.id === dani.id).status === 'closed');
  await store.addTemplate({ id: 'dani-vat', preset: 'vat-bimonthly', client: { email: 'dani@x.co.il', name: 'דני' }, lang: 'he' });
  const nov = new Date('2026-11-02T09:00:00').getTime();
  const made1 = await store.openDueTemplates(nov);
  const made2 = await store.openDueTemplates(nov + 3600000);
  check('a recurring checklist opens once for its period', made1.length === 1 && made2.length === 0);
  await store.releaseRequest(made1[0].id, nov);
  check('releasing a request closes it as released', saved.requests.find((x) => x.id === made1[0].id).items.every((i) => i.status === 'released'));
  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})();
