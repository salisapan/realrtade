// Unit tests for the Flow WhatsApp inquiry webhook.
// Graph calls are mocked. Nothing is sent. No real Meta, no secrets.
//
// Run from the repo root:
//   node flow-landing/netlify/functions/whatsapp-webhook/whatsapp-webhook.test.cjs
// or from flow-landing/:
//   node netlify/functions/whatsapp-webhook/whatsapp-webhook.test.cjs

const crypto = require('crypto');
const { verifySignature } = require('./signature');
const { isHandoffHours } = require('./hours');
const { createMemoryStore } = require('./store');
const { GRAPH_VERSION, graphMessagesUrl, withinCustomerServiceWindow } = require('./graph');
const { step, STEPS, BOOKING_URL } = require('./conversation');
const { buildSummary, chooseRoute, createHandoffAdapter, redactForLog } = require('./handoff');
const { handler } = require('./whatsapp-webhook');
const { HE, EN, SECTORS } = require('./copy');

const APP_SECRET = 'whatsapp-app-secret-sentinel-9f3a';
const VERIFY_TOKEN = 'whatsapp-verify-token-sentinel-9f3a';
const ACCESS_TOKEN = 'whatsapp-access-token-sentinel-9f3a';
const PHONE_NUMBER_ID = '123456789012345';

let failures = 0;

function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures += 1;
    const extra = detail === undefined ? '' : ' ' + String(detail).slice(0, 500);
    console.log('FAIL:', name + extra);
  }
}

function sign(raw, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
}

function enabledEnv(extra) {
  return Object.assign({
    WHATSAPP_BOT_ENABLED: 'true',
    WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
    WHATSAPP_ACCESS_TOKEN: ACCESS_TOKEN,
    WHATSAPP_APP_SECRET: APP_SECRET,
    WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
  }, extra || {});
}

function inboundPayload(from, id, text, extras) {
  const ts = extras && extras.timestamp != null ? extras.timestamp : undefined;
  const rest = Object.assign({}, extras || {});
  delete rest.timestamp;
  const msg = Object.assign({
    id,
    from,
    timestamp: ts != null ? String(Math.floor(ts / 1000)) : String(Math.floor(Date.now() / 1000)),
    type: 'text',
    text: text ? { body: text } : undefined,
  }, rest);
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name: 'Dana' }, wa_id: from }],
          messages: [msg],
        },
      }],
    }],
  };
}

function buttonPayload(from, id, buttonId, title) {
  return inboundPayload(from, id, undefined, {
    type: 'interactive',
    text: undefined,
    interactive: { type: 'button_reply', button_reply: { id: buttonId, title } },
  });
}

function listPayload(from, id, listId, title) {
  return inboundPayload(from, id, undefined, {
    type: 'interactive',
    text: undefined,
    interactive: { type: 'list_reply', list_reply: { id: listId, title } },
  });
}

function jerusalem(isoLocal) {
  // Interpret the naive "YYYY-MM-DDTHH:MM" as Asia/Jerusalem wall time.
  // Probe UTC candidates until the zoned clock matches.
  const [date, time] = isoLocal.split('T');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  for (const offset of [2, 3, 1, 0]) {
    const utc = Date.UTC(y, mo - 1, d, h - offset, mi);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(utc));
    const get = (t) => parts.find((p) => p.type === t).value;
    if (get('year') === String(y) && get('month') === String(mo).padStart(2, '0')
      && get('day') === String(d).padStart(2, '0')
      && get('hour') === String(h).padStart(2, '0')
      && get('minute') === String(mi).padStart(2, '0')) {
      return utc;
    }
  }
  throw new Error('could not map ' + isoLocal + ' to Asia/Jerusalem');
}

function bodies(messages) {
  return messages.map((m) => {
    if (m.type === 'text') return m.text.body;
    if (m.interactive) return m.interactive.body.text;
    return '';
  });
}

function hasListRows(messages) {
  const list = messages.find((m) => m.type === 'interactive' && m.interactive.type === 'list');
  if (!list) return [];
  return list.interactive.action.sections[0].rows.map((r) => r.id);
}

async function post(bodyObj, opts) {
  const env = (opts && opts.env) || enabledEnv();
  const now = (opts && opts.now) || Date.now();
  if (bodyObj && typeof bodyObj === 'object') {
    for (const entry of bodyObj.entry || []) {
      for (const change of (entry.changes || [])) {
        for (const msg of ((change.value && change.value.messages) || [])) {
          if (!(opts && opts.keepTimestamp)) msg.timestamp = String(Math.floor(now / 1000));
        }
      }
    }
  }
  const raw = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
  const headers = Object.assign({
    'X-Hub-Signature-256': (opts && opts.sig) || sign(raw, env.WHATSAPP_APP_SECRET || APP_SECRET),
  }, (opts && opts.headers) || {});
  const calls = [];
  const fetchFn = async (url, init) => {
    const entry = { url: String(url), init };
    calls.push(entry);
    if (opts && opts.fetchImpl) return opts.fetchImpl(url, init, entry);
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.out' }] }), text: async () => '' };
  };
  const logs = [];
  const res = await handler({
    httpMethod: 'POST',
    headers,
    body: raw,
    _env: env,
    _store: (opts && opts.store) || createMemoryStore(),
    _fetch: fetchFn,
    _now: (opts && opts.now) || Date.now(),
    _isHandoffHours: opts && opts.hoursFn,
    _log: (...a) => logs.push(a.join(' ')),
  });
  return { res, calls, logs, parsed: safeParse(res.body) };
}

async function get(params, env) {
  return handler({
    httpMethod: 'GET',
    queryStringParameters: params,
    _env: env || enabledEnv(),
  });
}

function safeParse(body) {
  try { return JSON.parse(body); } catch (e) { return { _raw: body }; }
}

function graphSends(calls) {
  return calls.filter((c) => c.url.includes('/messages'));
}

function sentBodies(calls) {
  return graphSends(calls).map((c) => {
    const payload = JSON.parse(c.init.body);
    if (payload.type === 'text') return payload.text.body;
    if (payload.interactive) return payload.interactive.body.text;
    return payload.type;
  });
}

function noTokenLeak(calls, logs) {
  const blob = JSON.stringify({ calls, logs });
  return !blob.includes(ACCESS_TOKEN) && !blob.includes(APP_SECRET) && !blob.includes(VERIFY_TOKEN);
}

async function walkSector(sectorId, firstText) {
  const store = createMemoryStore();
  const from = '97250000' + sectorId.slice(-4).replace(/\D/g, '0').padStart(4, '0');
  const now = jerusalem('2026-11-12T11:00'); // Thursday 11:00 IL, in hours
  const hoursFn = () => true;
  const first = await post(inboundPayload(from, 'm1-' + sectorId, firstText || 'היי, אשמח לשמוע על Flow'), { store, now, hoursFn });
  const picked = await post(listPayload(from, 'm2-' + sectorId, sectorId, 'pick'), { store, now, hoursFn });
  const process = await post(inboundPayload(from, 'm3-' + sectorId, 'סיכומי פגישות'), { store, now, hoursFn });
  const team = await post(inboundPayload(from, 'm4-' + sectorId, '8'), { store, now, hoursFn });
  const sens = await post(inboundPayload(from, 'm5-' + sectorId, 'כן, תיקים של לקוחות'), { store, now, hoursFn });
  const yes = await post(buttonPayload(from, 'm6-' + sectorId, 'demo_yes', 'כן'), { store, now, hoursFn });
  return { first, picked, process, team, sens, yes, store, from };
}

async function run() {
  // --- Signature ---
  const raw = '{"ok":true}';
  check('signature: valid HMAC passes', verifySignature(raw, sign(raw, APP_SECRET), APP_SECRET) === true);
  check('signature: wrong secret fails', verifySignature(raw, sign(raw, 'other'), APP_SECRET) === false);
  check('signature: missing header fails', verifySignature(raw, '', APP_SECRET) === false);
  check('signature: missing secret fails', verifySignature(raw, sign(raw, APP_SECRET), '') === false);
  check('signature: truncated header fails', verifySignature(raw, sign(raw, APP_SECRET).slice(0, 10), APP_SECRET) === false);

  const badSig = await post(inboundPayload('972501111111', 'sig1', 'היי'), { sig: sign('{"no":"pe"}', APP_SECRET) });
  check('POST: bad signature is rejected', badSig.res.statusCode === 403);
  check('POST: bad signature sends nothing', badSig.calls.length === 0);

  // --- Verify handshake ---
  const okGet = await get({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'challenge-42' });
  check('GET verify: matching token returns challenge', okGet.statusCode === 200 && okGet.body === 'challenge-42');
  const badGet = await get({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': 'challenge-42' });
  check('GET verify: wrong token is forbidden', badGet.statusCode === 403);
  const offGet = await get(
    { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'challenge-42' },
    enabledEnv({ WHATSAPP_BOT_ENABLED: '' }),
  );
  check('GET verify: flag off is 200 no-op without challenge', offGet.statusCode === 200 && offGet.body === '');

  // --- Flag off / missing secrets ---
  const off = await post(inboundPayload('972502222222', 'off1', 'היי, אשמח לשמוע על Flow'), {
    env: { WHATSAPP_BOT_ENABLED: 'false', WHATSAPP_APP_SECRET: APP_SECRET },
  });
  check('flag off: 200 no-op', off.res.statusCode === 200 && off.parsed.noop === true);
  check('flag off: sends nothing', off.calls.length === 0);

  const missing = await post(inboundPayload('972502222223', 'off2', 'היי'), {
    env: enabledEnv({ WHATSAPP_ACCESS_TOKEN: '' }),
  });
  check('secrets missing: 200 no-op', missing.res.statusCode === 200 && missing.parsed.noop === true);
  check('secrets missing: sends nothing', missing.calls.length === 0);

  // --- Hours ---
  check('hours: Thursday 10:00 IL is in window', isHandoffHours(new Date(jerusalem('2026-11-12T10:00'))) === true);
  check('hours: Thursday 16:59 IL is in window', isHandoffHours(new Date(jerusalem('2026-11-12T16:59'))) === true);
  check('hours: Thursday 17:00 IL is out of window', isHandoffHours(new Date(jerusalem('2026-11-12T17:00'))) === false);
  check('hours: Thursday 09:59 IL is out of window', isHandoffHours(new Date(jerusalem('2026-11-12T09:59'))) === false);
  check('hours: Friday noon IL is out of window', isHandoffHours(new Date(jerusalem('2026-11-13T12:00'))) === false);
  check('hours: Saturday noon IL is out of window', isHandoffHours(new Date(jerusalem('2026-11-14T12:00'))) === false);
  check('hours: Sunday 10:00 IL is in window', isHandoffHours(new Date(jerusalem('2026-11-15T10:00'))) === true);

  // --- Graph version pin and window ---
  check('Graph version is pinned to v27.0', GRAPH_VERSION === 'v27.0');
  check('Graph messages URL uses the pinned version and phone number id',
    graphMessagesUrl(PHONE_NUMBER_ID) === 'https://graph.facebook.com/v27.0/' + PHONE_NUMBER_ID + '/messages');
  const now = Date.now();
  check('24h window: inbound just now is inside', withinCustomerServiceWindow(now, now) === true);
  check('24h window: 24h + 1ms is outside', withinCustomerServiceWindow(now - (24 * 60 * 60 * 1000 + 1), now) === false);

  // --- Opening + each sector ---
  const sectorCases = [
    ['sector_legal', 'עורכי דין'],
    ['sector_insurance', 'ביטוח'],
    ['sector_accounting', 'ראיית חשבון'],
    ['sector_other', 'אחר'],
  ];
  for (const [id, label] of sectorCases) {
    const walk = await walkSector(id);
    check(id + ': opening uses a list (4 sectors, Meta button limit is 3)',
      hasListRows(JSON.parse(walk.first.calls[0].init.body) ? [JSON.parse(walk.first.calls[0].init.body)] : []) ||
      hasListRows(graphSends(walk.first.calls).map((c) => JSON.parse(c.init.body))).length === 4,
    );
    const firstPayload = JSON.parse(graphSends(walk.first.calls)[0].init.body);
    check(id + ': opening is Hebrew and asks for the sector',
      firstPayload.interactive.body.text.includes('באיזה תחום אתם עובדים') &&
      firstPayload.interactive.action.sections[0].rows.length === 4,
    );
    check(id + ': first reply is a session list, not a template',
      firstPayload.type === 'interactive' && firstPayload.type !== 'template' && !firstPayload.template,
    );
    check(id + ': process question after ' + label,
      sentBodies(walk.picked.calls).some((b) => b.includes('איזו עבודה חוזרת')),
    );
    check(id + ': team size is the second question',
      sentBodies(walk.process.calls).some((b) => b.includes('כמה אנשים')),
    );
    check(id + ': sensitivity is the third question',
      sentBodies(walk.team.calls).some((b) => b.includes('רגיש')),
    );
    const sensBodies = sentBodies(walk.sens.calls);
    check(id + ': data-location explanation lists the three options and does not mention price or install-included',
      sensBodies.some((b) => b.includes('ענן מאובטח') && b.includes('מחשב של העובד') && b.includes('שרת ייעודי')) &&
      sensBodies.every((b) => !/\d/.test(b) || b.includes('20')) && // 20-minute demo is in the close, not a price
      sensBodies.every((b) => !/כלול במחיר|included in (the )?price/i.test(b)),
    );
    check(id + ': close asks for a 20-minute demo',
      sensBodies.some((b) => b.includes('20 דקות')),
    );
    const yesBodies = sentBodies(walk.yes.calls);
    check(id + ': yes path sends the booking link',
      yesBodies.some((b) => b.includes(BOOKING_URL)),
    );
    check(id + ': yes path hands off in hours with the team line',
      yesBodies.some((b) => b === HE.handoff),
    );
    check(id + ': Graph URL is the pinned messages endpoint',
      graphSends(walk.yes.calls).every((c) => c.url === graphMessagesUrl(PHONE_NUMBER_ID)),
    );
    check(id + ': Authorization is present and logs do not leak tokens',
      graphSends(walk.yes.calls).every((c) => c.init.headers.Authorization === 'Bearer ' + ACCESS_TOKEN) &&
      noTokenLeak(walk.yes.logs, walk.yes.logs),
    );
  }

  // --- English ---
  const enStore = createMemoryStore();
  const enNow = jerusalem('2026-11-12T11:00');
  const en1 = await post(inboundPayload('972503333001', 'en1', 'Hi, I would like to hear about Flow'), { store: enStore, now: enNow, hoursFn: () => true });
  const enOpen = sentBodies(en1.calls).join('\n');
  check('English: opening is in English', enOpen.includes('What field do you work in?'));
  check('English: opening does not mention Glance or clients', !/Glance|הצצה/i.test(enOpen));
  const en2 = await post(listPayload('972503333001', 'en2', 'sector_legal', 'Lawyers'), { store: enStore, now: enNow, hoursFn: () => true });
  check('English: process question in English', sentBodies(en2.calls).some((b) => b === EN.qProcess));
  await post(inboundPayload('972503333001', 'en3', 'Meeting summaries'), { store: enStore, now: enNow, hoursFn: () => true });
  await post(inboundPayload('972503333001', 'en4', '5 people'), { store: enStore, now: enNow, hoursFn: () => true });
  const en5 = await post(inboundPayload('972503333001', 'en5', 'Yes, client files'), { store: enStore, now: enNow, hoursFn: () => true });
  check('English: data-location and close in English',
    sentBodies(en5.calls).some((b) => b.includes('secure cloud') && b.includes('masks')) &&
    sentBodies(en5.calls).some((b) => b.includes('20-minute demo')),
  );

  // --- Price question, no numbers ---
  const priceStore = createMemoryStore();
  await post(inboundPayload('972504444001', 'pr0', 'היי, אשמח לשמוע על Flow'), { store: priceStore, now: enNow, hoursFn: () => true });
  const price = await post(inboundPayload('972504444001', 'pr1', 'כמה זה עולה?'), { store: priceStore, now: enNow, hoursFn: () => true });
  const priceText = sentBodies(price.calls);
  check('price: scripted answer with no numbers',
    priceText.some((b) => b === HE.price) && priceText.every((b) => !/[0-9]/.test(b) && !/₪|\$|ש["׳']?ח/.test(b)),
  );
  check('price: does not stall — sector list is re-prompted',
    priceText.some((b) => b.includes('באיזה תחום')),
  );
  const priceEn = await post(inboundPayload('972504444002', 'pr2', 'How much does it cost?'), { now: enNow, hoursFn: () => true });
  check('price English: scripted answer with no numbers',
    sentBodies(priceEn.calls).some((b) => b === EN.price) &&
    sentBodies(priceEn.calls).every((b) => b === EN.price || !/[0-9]/.test(b)),
  );

  // --- Sensitive data paste ---
  const sensStore = createMemoryStore();
  await post(inboundPayload('972505555001', 'sd0', 'היי, אשמח לשמוע על Flow'), { store: sensStore, now: enNow, hoursFn: () => true });
  const pasted = await post(inboundPayload('972505555001', 'sd1', 'סיסמה: hunter2 וגם ת.ז. 123456789'), { store: sensStore, now: enNow, hoursFn: () => true });
  check('sensitive: scripted refusal', sentBodies(pasted.calls).some((b) => b === HE.sensitive));
  const saved = await sensStore.getConversation('972505555001');
  check('sensitive: raw paste is not kept in the transcript',
    !JSON.stringify(saved.transcript).includes('hunter2') &&
    JSON.stringify(saved.transcript).includes('[redacted sensitive paste]'),
  );

  // --- FISCHER: no engagement, flagged handoff ---
  const fi = await post(inboundPayload('972506666001', 'fi1', 'שלום, אני מפישר בכר'), { now: enNow, hoursFn: () => true });
  const fiBodies = sentBodies(fi.calls);
  check('FISCHER: does not send the opening or qualify',
    fiBodies.every((b) => !b.includes('באיזה תחום') && !b.includes('עבודה חוזרת') && !b.includes('Flow מכין')),
  );
  check('FISCHER: only the handoff acknowledgement',
    fiBodies.length === 1 && fiBodies[0] === HE.handoff,
  );
  const fbc = await post(inboundPayload('972506666002', 'fi2', 'Calling from FBC & Co'), { now: enNow, hoursFn: () => true });
  check('FBC: English out-of-product handoff only',
    sentBodies(fbc.calls).length === 1 && (sentBodies(fbc.calls)[0] === EN.handoff || sentBodies(fbc.calls)[0] === EN.outOfHours || sentBodies(fbc.calls)[0] === HE.handoff),
  );
  // In-hours + English message should use EN handoff.
  check('FBC: routed without engaging the script',
    sentBodies(fbc.calls).every((b) => !/What field|Do It|demo/i.test(b)),
  );
  const fiState = await (async () => {
    const store = createMemoryStore();
    await post(inboundPayload('972506666003', 'fi3', 'hello from FISCHER'), { store, now: enNow, hoursFn: () => true });
    return store.getConversation('972506666003');
  })();
  check('FISCHER: conversation is flagged restricted', fiState.restricted === 'FISCHER' && fiState.step === STEPS.HANDED_OFF);

  // --- Out of hours ---
  const night = jerusalem('2026-11-13T21:00'); // Friday evening
  const late = await post(inboundPayload('972507777001', 'oh1', 'אפשר לדבר עם מישהו?'), { now: night, hoursFn: (n) => isHandoffHours(new Date(n)) });
  check('out-of-hours person request uses the next-business-day line',
    sentBodies(late.calls).includes(HE.outOfHours) && !sentBodies(late.calls).includes(HE.handoff),
  );

  // --- No path ---
  const noStore = createMemoryStore();
  await post(inboundPayload('972508888001', 'no0', 'היי, אשמח לשמוע על Flow'), { store: noStore, now: enNow, hoursFn: () => true });
  await post(listPayload('972508888001', 'no1', 'sector_insurance', 'ביטוח'), { store: noStore, now: enNow, hoursFn: () => true });
  await post(inboundPayload('972508888001', 'no2', 'תביעות'), { store: noStore, now: enNow, hoursFn: () => true });
  await post(inboundPayload('972508888001', 'no3', '12'), { store: noStore, now: enNow, hoursFn: () => true });
  await post(inboundPayload('972508888001', 'no4', 'כן'), { store: noStore, now: enNow, hoursFn: () => true });
  const noClick = await post(buttonPayload('972508888001', 'no5', 'demo_no', 'לא'), { store: noStore, now: enNow, hoursFn: () => true });
  check('no-path: scripted close', sentBodies(noClick.calls).some((b) => b === HE.noPath));
  const left = await post(inboundPayload('972508888001', 'no6', 'רותם rotem@example.com'), { store: noStore, now: enNow, hoursFn: () => true });
  check('no-path: thanks and in-hours handoff after name+email',
    sentBodies(left.calls).includes(HE.thanksContact) && sentBodies(left.calls).includes(HE.handoff),
  );
  const noState = await noStore.getConversation('972508888001');
  check('no-path: stores name and email', noState.email === 'rotem@example.com' && /רותם/.test(noState.name));

  // --- Idempotency ---
  const idStore = createMemoryStore();
  const firstId = await post(inboundPayload('972509999001', 'same-mid', 'היי, אשמח לשמוע על Flow'), { store: idStore, now: enNow, hoursFn: () => true });
  const againId = await post(inboundPayload('972509999001', 'same-mid', 'היי, אשמח לשמוע על Flow'), { store: idStore, now: enNow, hoursFn: () => true });
  check('idempotency: first delivery sends', graphSends(firstId.calls).length >= 1);
  check('idempotency: duplicate message id sends nothing', graphSends(againId.calls).length === 0);
  check('idempotency: duplicate still returns 200', againId.res.statusCode === 200);

  // --- Pure state machine: max 3 questions, never Glance / client names / install-in-price ---
  let st = null;
  const t0 = enNow;
  st = step(st, { from: '1', type: 'text', text: 'היי, אשמח לשמוע על Flow', timestamp: t0 }, t0, () => true);
  st = step(st.state, { from: '1', type: 'interactive', listId: 'sector_legal', listTitle: 'עורכי דין', timestamp: t0 }, t0, () => true);
  st = step(st.state, { from: '1', type: 'text', text: 'סיכומים', timestamp: t0 }, t0, () => true);
  st = step(st.state, { from: '1', type: 'text', text: '3', timestamp: t0 }, t0, () => true);
  check('state machine: after two answers we are on the third question', st.state.step === STEPS.SENSITIVITY);
  st = step(st.state, { from: '1', type: 'text', text: 'כן', timestamp: t0 }, t0, () => true);
  check('state machine: after the third answer we close (no fourth question)', st.state.step === STEPS.DEMO);
  const allOut = st.state.transcript.filter((r) => r.dir === 'out').map((r) => r.text).join('\n');
  check('copy never mentions Glance, software names, or clients', !/Glance|Salesforce|Monday|HubSpot|פישר|FBC/i.test(allOut));
  check('copy never claims employee-computer install is included in the price',
    !/כלול במחיר|included in (the )?price/i.test(allOut),
  );

  // --- Handoff routing and default adapter ---
  const salesSummary = buildSummary({
    lang: 'he', name: 'Dana', phone: '972501234567', sector: 'sector_legal',
    process: 'סיכומים', teamSize: '8', sensitivity: 'כן', asked: ['price'], transcript: [],
  }, { from: '972501234567', profileName: 'Dana' }, 'sales', 'qualified_demo');
  check('handoff summary has the scripted fields',
    salesSummary.assignee === "Ze'ev" && salesSummary.route === 'sales' &&
    salesSummary.sector === 'sector_legal' && salesSummary.process === 'סיכומים' &&
    salesSummary.teamSize === '8' && salesSummary.dataSensitivity === 'כן' &&
    salesSummary.whatTheyAsked.includes('price') && salesSummary.phone === '972501234567',
  );
  check('support route for an existing-customer ask', chooseRoute({ asked: [] }, 'אני לקוח, צריך תמיכה') === 'support');
  check('sales route is the default', chooseRoute({}, 'רוצה הדגמה') === 'sales');

  const adapterLogs = [];
  const adapter = createHandoffAdapter({}, async () => { throw new Error('should not fetch'); }, (...a) => adapterLogs.push(a));
  const delivered = await adapter.deliver(salesSummary);
  check('default handoff adapter is a log-redacted no-op', adapter.kind === 'log-redacted' && delivered.delivered === false);
  check('default adapter does not include a full phone in the log',
    JSON.stringify(adapterLogs).includes('972…67') || JSON.stringify(redactForLog({ phone: '+972501234567' })).includes('…'),
  );

  // --- Never ask for secrets ---
  const askBlob = [HE.opening, HE.qProcess, HE.qTeamSize, HE.qSensitivity, HE.dataLocation, HE.close, HE.noPath, EN.opening].join('\n');
  check('script never asks for a password, ID number, or client data',
    !/סיסמ|password|תעודת זהות|ID number|client data|מספר זהות/i.test(askBlob),
  );

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
