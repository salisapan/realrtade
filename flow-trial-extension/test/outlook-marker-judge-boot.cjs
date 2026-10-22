// Boot test: judge.bundle.mjs must import and run one judge call.
// Run: node test/outlook-marker-judge-boot.cjs
'use strict';
const path = require('path');

const bundleUrl = path.join(__dirname, '..', '..', 'supabase', 'functions', 'outlook-graph-marker', 'judge.bundle.mjs');

(async () => {
  const mod = await import(bundleUrl);
  if (!mod || typeof mod.judgeOutlookInboxMessage !== 'function') {
    console.log('FAIL: judgeOutlookInboxMessage export missing');
    process.exit(1);
  }
  const msg = {
    subject: 'Budget',
    body: { contentType: 'text', content: 'Can you send me the Q3 total from the budget sheet by Friday?' },
    from: { emailAddress: { name: 'Dana', address: 'dana@acme.io' } },
    toRecipients: [{ emailAddress: { address: 'glance.salisapan@outlook.com' } }],
    hasAttachments: false
  };
  const r = mod.judgeOutlookInboxMessage(msg, ['glance.salisapan@outlook.com']);
  if (!r || typeof r.show !== 'boolean') {
    console.log('FAIL: judge returned no decision', r);
    process.exit(1);
  }
  console.log('outlook-marker-judge-boot: PASS (show=' + r.show + ')');
})().catch((err) => {
  console.log('FAIL: bundle import', err && err.message || err);
  process.exit(1);
});
