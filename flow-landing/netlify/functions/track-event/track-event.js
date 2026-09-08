// Relays anonymous, aggregate Glance product-usage events (chip shown,
// clicked, dismissed; a write completed; a connector configured) to GA4 via
// the Measurement Protocol. This is the only visibility the product has into
// whether an install ever sees real usage after the popup is closed — see
// docs/product-architecture.md and the Value Hypothesis discussion this
// exists to answer.
//
// Deliberately never carries email content, sender identity, extracted
// money/date facts, or anything else judgment.js scored — those never leave
// the device, full stop (see privacy.html §5). Only the install id (a random
// local identifier, not tied to any account) and a short, allow-listed event
// name plus a couple of non-sensitive params (which connector, which line of
// work) travel here.
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
  'connector_configured'
]);
const ALLOWED_PARAM_KEYS = new Set(['domain', 'connector']);

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
    if (ALLOWED_PARAM_KEYS.has(k) && typeof rawParams[k] === 'string' && rawParams[k].length <= 40) {
      params[k] = rawParams[k];
    }
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
