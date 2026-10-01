// Relays anonymous, aggregate Glance product-usage events (chip shown,
// clicked, dismissed; a write completed; a process closed by either method;
// an action undone; a connector configured; Draft-It used; an attachment
// summarized; one daily active ping; one weekly-habit-formed ping) to GA4
// via the Measurement Protocol.
// This — plus what a person can compute from these counts (acceptance rate,
// dismissal rate, undo rate, opened-vs-closed) — is the entire retention
// signal the product has into whether an install ever sees real usage after
// the popup is closed. See docs/product-architecture.md and the Value
// Hypothesis discussion this exists to answer.
//
// Deliberately never carries email content, sender identity, extracted
// money/date facts, or anything else judgment.js scored — those never leave
// the device, full stop (see privacy.html §5). Only the install id (a random
// local identifier, not tied to any account), a short allow-listed event
// name, and a couple of non-sensitive, individually-validated params travel
// here — see PARAM_VALIDATORS below for exactly what each one accepts.
//
// The API secret is a GA4 property setting (Admin > Data Streams > choose
// the stream > Measurement Protocol API secrets > Create), not something
// this codebase can generate — same category of manual, one-time setup step
// as the OAuth Client IDs in the extension's background.js. Until it's set,
// this function accepts events and no-ops rather than failing loudly, so the
// extension never sees an error for something this optional.

const GA_MEASUREMENT_ID = 'G-ESYDFQYCDV';
const LOG_PREFIX = '[track-event]';

const ALLOWED_EVENTS = new Set([
  'chip_shown',
  'chip_clicked',
  'write_completed',
  'chip_dismissed',
  'connector_configured',
  'draft_generated',
  'attachment_summarized',
  // Retention-measurement additions — see content-gmail.js's
  // trackDailyActive(), showMultiActionReceipt(), and onDismiss().
  'extension_active',
  'action_undone',
  'process_closed',
  // Product-market-fit measurement: the one cross-install rollup signal
  // this pipe carries. Fired at most once per install per calendar week —
  // see content-gmail.js's trackWeeklyHabit() and storage.js's
  // consumeWeeklyHabitTrigger(). Everything else PMF-related (closure
  // rate, retention) is computed and stays entirely on-device — see
  // core/pmf-metrics.js — because it's only ever meaningful per account,
  // not as a population rollup.
  'weekly_habit_formed',
  // Glance Pro funnel: the two moments that matter for revenue, nothing about
  // the person or the mail. Fired from the popup only.
  'pro_start_clicked',
  'pro_activated'
]);

// Each allowed param key validates its own value rather than sharing one
// blanket string/length check — actionCount is a real number (GA4's
// Measurement Protocol accepts numeric params natively; the old blanket
// `typeof === 'string'` check silently dropped it every time it was sent),
// and method is constrained to the exact two closure types the extension
// can actually produce, not any string someone might send this endpoint.
const PARAM_VALIDATORS = {
  domain: (v) => typeof v === 'string' && v.length <= 40,
  connector: (v) => typeof v === 'string' && v.length <= 40,
  method: (v) => v === 'done' || v === 'dismissed',
  // Bounded by actions.js's own MAX_ACTIONS — never a real process closes
  // with more steps than the catalog can propose.
  actionCount: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5
};

exports.handler = async function (event) {
  var reqId = Math.random().toString(16).slice(2, 8);
  var log = function (msg, extra) { console.log(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : ''); };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  var payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  var installId = String(payload.installId || '').trim();
  var name = String(payload.event || '').trim();
  if (!installId || !/^[a-f0-9]{8,32}$/i.test(installId) || !ALLOWED_EVENTS.has(name)) {
    return { statusCode: 400, body: 'Invalid event' };
  }

  var params = {};
  var rawParams = payload.params && typeof payload.params === 'object' ? payload.params : {};
  Object.keys(rawParams).forEach(function (k) {
    var validate = PARAM_VALIDATORS[k];
    if (validate && validate(rawParams[k])) params[k] = rawParams[k];
  });

  var apiSecret = process.env.GA4_MP_API_SECRET;
  if (!apiSecret) {
    log('no GA4_MP_API_SECRET configured — accepting and no-oping', { event: name });
    return { statusCode: 204, body: '' };
  }

  try {
    var url = 'https://www.google-analytics.com/mp/collect?measurement_id=' + GA_MEASUREMENT_ID + '&api_secret=' + apiSecret;
    await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        client_id: installId,
        events: [{ name: name, params: params }]
      })
    });
  } catch (err) {
    // Never let a telemetry failure surface to the extension — it isn't
    // load-bearing for anything the user is doing.
    log('GA4 relay failed (non-fatal)', String(err));
  }

  return { statusCode: 204, body: '' };
};
