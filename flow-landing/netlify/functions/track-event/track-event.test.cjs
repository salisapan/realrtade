// Regression test for track-event.js — the server-side validator that keeps
// this endpoint from becoming an arbitrary-event/arbitrary-param relay to
// GA4. Exercises the exported handler directly (no HTTP layer), stubbing
// fetch to capture exactly what would have been sent to Google, so this
// tests the real validation logic end to end rather than just re-stating it.
//
// Run: node netlify/functions/track-event/track-event.test.cjs

process.env.GA4_MP_API_SECRET = 'test-secret';

let lastFetchBody = null;
global.fetch = async (url, opts) => {
  lastFetchBody = JSON.parse(opts.body);
  return { ok: true };
};

const { handler } = require('./track-event.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

async function post(body) {
  lastFetchBody = null;
  const res = await handler({ httpMethod: 'POST', body: JSON.stringify(body) });
  return { res, sent: lastFetchBody };
}

async function run() {
  console.log('--- track-event.js: event name allowlist ---\n');
  {
    const { res, sent } = await post({ installId: 'abc12345', event: 'process_closed', params: { domain: 'sales', method: 'done' } });
    check('a newly allowed retention event is accepted (204)', res.statusCode === 204, res);
    check('it actually reaches the GA4 relay with the right event name', Boolean(sent) && sent.events[0].name === 'process_closed', sent);
  }
  {
    const { res, sent } = await post({ installId: 'abc12345', event: 'not_a_real_event', params: {} });
    check('an unlisted event name is rejected with 400', res.statusCode === 400, res);
    check('a rejected event never reaches the GA4 relay', sent === null, sent);
  }

  console.log('\n--- track-event.js: installId shape ---\n');
  {
    const { res } = await post({ installId: 'not-hex!!', event: 'chip_shown', params: {} });
    check('a non-hex installId is rejected', res.statusCode === 400, res);
  }
  {
    const { res } = await post({ event: 'chip_shown', params: {} });
    check('a missing installId is rejected', res.statusCode === 400, res);
  }

  console.log('\n--- track-event.js: per-key param validation ---\n');
  {
    const { sent } = await post({ installId: 'abc12345', event: 'process_closed', params: { method: 'done' } });
    check('a valid method value passes through', sent.events[0].params.method === 'done', sent);
  }
  {
    const { sent } = await post({ installId: 'abc12345', event: 'process_closed', params: { method: 'something-else' } });
    check('an out-of-enum method value is dropped, not passed through as free text', sent.events[0].params.method === undefined, sent);
  }
  {
    // This is the regression case: actionCount is a real number, and the
    // old blanket `typeof === 'string'` check silently dropped every one of
    // these before PARAM_VALIDATORS existed.
    const { sent } = await post({ installId: 'abc12345', event: 'write_completed', params: { actionCount: 3 } });
    check('a valid integer actionCount now passes through as a real number', sent.events[0].params.actionCount === 3, sent);
  }
  {
    const { sent } = await post({ installId: 'abc12345', event: 'write_completed', params: { actionCount: '3' } });
    check('actionCount sent as a string, not a real number, is dropped', sent.events[0].params.actionCount === undefined, sent);
  }
  {
    const { sent } = await post({ installId: 'abc12345', event: 'write_completed', params: { actionCount: 999 } });
    check('an out-of-range actionCount (beyond MAX_ACTIONS) is dropped', sent.events[0].params.actionCount === undefined, sent);
  }
  {
    const { sent } = await post({ installId: 'abc12345', event: 'chip_shown', params: { domain: 'sales', evilKey: 'dropme' } });
    check('only allow-listed param keys ever reach the relay', Object.keys(sent.events[0].params).join(',') === 'domain', sent);
  }
  {
    const { sent } = await post({ installId: 'abc12345', event: 'chip_shown', params: { domain: 'x'.repeat(41) } });
    check('an over-length string param is dropped', sent.events[0].params.domain === undefined, sent);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
