// Read-only diagnostic for exactly one recurring failure class: a visitor
// submits the waitlist/trial form and gets "Something went wrong" with no
// further detail. That message can mean one of three things — a missing env
// var, an unverified Resend sending domain, or a rejected/revoked API key —
// and all three look identical from the browser. This endpoint answers which
// one it is without ever printing a secret value.
//
// Access is gated behind knowing EMAIL_VERIFY_SECRET itself (passed as
// ?key=), the same secret already used to sign confirmation links, so this
// never needs a second credential to manage.
//
// Usage: GET /.netlify/functions/check-email-config?key=<EMAIL_VERIFY_SECRET>
const crypto = require('crypto');

const SENDING_DOMAIN = 'theflow-ai.com';

function safeEqual(a, b) {
  var bufA = Buffer.from(String(a));
  var bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

exports.handler = async function (event) {
  var secret = process.env.EMAIL_VERIFY_SECRET;
  var providedKey = (event.queryStringParameters || {}).key || '';

  if (!secret || !providedKey || !safeEqual(providedKey, secret)) {
    return { statusCode: 404, body: 'Not found' };
  }

  var report = {
    checked_at: new Date().toISOString(),
    env: {
      RESEND_API_KEY: process.env.RESEND_API_KEY ? 'set' : 'MISSING',
      EMAIL_VERIFY_SECRET: 'set (you used it to authenticate this request)',
      HUBSPOT_CLIENT_ID: process.env.HUBSPOT_CLIENT_ID ? 'set' : 'not set (HubSpot connector will show its own error to users, this is expected if Notion-only for now)',
      HUBSPOT_CLIENT_SECRET: process.env.HUBSPOT_CLIENT_SECRET ? 'set' : 'not set (same as above)',
    },
    resend_domain: null,
  };

  var apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      var res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: 'Bearer ' + apiKey },
      });
      if (!res.ok) {
        report.resend_domain = {
          ok: false,
          status: res.status,
          note: res.status === 401 || res.status === 403
            ? 'RESEND_API_KEY was rejected — it is set but invalid, revoked, or wrong environment (test vs live).'
            : 'Resend API returned an unexpected status when listing domains.',
        };
      } else {
        var data = await res.json();
        var domains = (data && data.data) || [];
        var match = domains.find(function (d) { return d.name === SENDING_DOMAIN; });
        report.resend_domain = match
          ? { ok: match.status === 'verified', name: match.name, status: match.status, region: match.region }
          : { ok: false, note: SENDING_DOMAIN + ' is not registered in this Resend account at all — every send from hello@' + SENDING_DOMAIN + ' will be rejected until it is added and verified.' };
      }
    } catch (err) {
      report.resend_domain = { ok: false, note: 'Network error reaching Resend API: ' + String(err) };
    }
  } else {
    report.resend_domain = { ok: false, note: 'Cannot check — RESEND_API_KEY is not set.' };
  }

  var verdict;
  if (report.env.RESEND_API_KEY === 'MISSING') {
    verdict = 'BLOCKED: set RESEND_API_KEY in Netlify > Site configuration > Environment variables, then redeploy.';
  } else if (report.resend_domain && report.resend_domain.ok === false && report.resend_domain.status === 401) {
    verdict = 'BLOCKED: RESEND_API_KEY is set but Resend is rejecting it — generate a fresh key in the Resend dashboard.';
  } else if (report.resend_domain && !report.resend_domain.ok) {
    verdict = 'BLOCKED: sending domain ' + SENDING_DOMAIN + ' is missing or not verified in Resend — add it under Resend > Domains and add the DNS records it gives you, then wait for verification.';
  } else {
    verdict = 'All checks passed — email sending should be working. If users still see "Something went wrong", check the Netlify function logs for the specific request (search "[send-confirmation]") for the exact Resend error.';
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verdict: verdict, report: report }, null, 2),
  };
};
