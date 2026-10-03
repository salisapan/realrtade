// community-delta: dormant by default; serves the latest signed delta; 204 until one exists.
// Run: node netlify/functions/community-delta/community-delta.test.cjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
let calls = [], rows = [];
global.fetch = async (url) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => rows }; };
const { handler } = require('./community-delta.js');
let fails = 0; const check = (n, c, d) => { if (c) console.log('PASS:', n); else { fails++; console.log('FAIL:', n, JSON.stringify(d)); } };
(async () => {
  delete process.env.COMMUNITY_ENABLED;
  let r = await handler({ httpMethod: 'GET' });
  check('DORMANT: 503 and no database call', r.statusCode === 503 && calls.length === 0, r);
  process.env.COMMUNITY_ENABLED = '1';
  r = await handler({ httpMethod: 'GET' });
  check('nothing published yet: 204', r.statusCode === 204, r);
  rows = [{ round: 7, payload: '{"round":7}', sig: 'abc' }];
  r = await handler({ httpMethod: 'GET' });
  const j = JSON.parse(r.body);
  check('the latest payload and its signature, exactly as stored', r.statusCode === 200 && j.payload === '{"round":7}' && j.sig === 'abc' && Object.keys(j).sort().join() === 'payload,sig', r);
  check('cacheable for an hour', /max-age=3600/.test(r.headers['Cache-Control']));
  check('it asks for the newest round only', /order=round\.desc&limit=1/.test(calls[calls.length - 1]), calls);
  check('only GET', (await handler({ httpMethod: 'POST' })).statusCode === 405);
  console.log('\nTOTAL FAILURES: ' + fails);
  process.exit(fails ? 1 : 0);
})();
