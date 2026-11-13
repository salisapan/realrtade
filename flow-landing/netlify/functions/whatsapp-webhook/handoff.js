// Build a handoff summary and deliver it through a pluggable adapter.
// Default adapter: log a redacted summary and send nothing. A webhook or
// email endpoint is used only when the corresponding env is set. This change
// does not wire a real inbox.
const { isSupportRoute } = require('./detect');
const { sectorTitle } = require('./copy');

const TRANSCRIPT_EXCERPT_LIMIT = 8;
const TRANSCRIPT_LINE_LIMIT = 200;

function redactForLog(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value
      .replace(/\+\d{6,}/g, (m) => m.slice(0, 3) + '…' + m.slice(-2))
      .replace(/\b\d{9,}\b/g, (m) => m.slice(0, 2) + '…' + m.slice(-2))
      .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, (m) => m[0] + '…@' + m.split('@')[1]);
  }
  if (Array.isArray(value)) return value.map(redactForLog);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/token|secret|password|authorization/i.test(k)) out[k] = '[redacted]';
      else out[k] = redactForLog(v);
    }
    return out;
  }
  return value;
}

function clipLine(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= TRANSCRIPT_LINE_LIMIT) return s;
  return s.slice(0, TRANSCRIPT_LINE_LIMIT) + '…';
}

function buildSummary(state, inbound, route, reason) {
  const lang = (state && state.lang) || 'he';
  const transcript = ((state && state.transcript) || []).slice(-TRANSCRIPT_EXCERPT_LIMIT).map((row) => ({
    dir: row.dir,
    text: clipLine(row.text),
    at: row.at,
  }));
  return {
    route, // "sales" (Ze'ev) or "support" (Yael)
    assignee: route === 'support' ? 'Yael' : "Ze'ev",
    reason: reason || 'qualified',
    restricted: !!(state && state.restricted),
    restrictedFlag: state && state.restricted ? state.restricted : null,
    name: (state && state.name) || (inbound && inbound.profileName) || null,
    phone: (state && state.phone) || (inbound && inbound.from) || null,
    sector: (state && state.sector) || null,
    sectorLabel: state && state.sector ? sectorTitle(state.sector, lang) : null,
    process: (state && state.process) || null,
    teamSize: (state && state.teamSize) || null,
    dataSensitivity: (state && state.sensitivity) || null,
    whatTheyAsked: (state && state.asked) || [],
    transcriptExcerpt: transcript,
    lang,
  };
}

function chooseRoute(state, inboundText) {
  return isSupportRoute(inboundText, state) ? 'support' : 'sales';
}

function createLogRedactedAdapter(log) {
  const write = log || ((...args) => console.log(...args));
  return {
    kind: 'log-redacted',
    async deliver(summary) {
      write('[whatsapp-handoff] (no-op)', JSON.stringify(redactForLog(summary)));
      return { ok: true, delivered: false };
    },
  };
}

function createWebhookAdapter(url, fetchFn, log) {
  const write = log || ((...args) => console.log(...args));
  return {
    kind: 'webhook',
    async deliver(summary) {
      const res = await (fetchFn || fetch)(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
      });
      if (!res.ok) {
        write('[whatsapp-handoff] webhook failed', res.status);
        throw new Error('handoff webhook failed: HTTP ' + res.status);
      }
      return { ok: true, delivered: true };
    },
  };
}

function createEmailEndpointAdapter(url, fetchFn, log) {
  const write = log || ((...args) => console.log(...args));
  return {
    kind: 'email-endpoint',
    async deliver(summary) {
      const res = await (fetchFn || fetch)(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
      });
      if (!res.ok) {
        write('[whatsapp-handoff] email endpoint failed', res.status);
        throw new Error('handoff email endpoint failed: HTTP ' + res.status);
      }
      return { ok: true, delivered: true };
    },
  };
}

function createHandoffAdapter(env, fetchFn, log) {
  if (env && env.HANDOFF_WEBHOOK_URL) {
    return createWebhookAdapter(env.HANDOFF_WEBHOOK_URL, fetchFn, log);
  }
  if (env && env.HANDOFF_EMAIL_ENDPOINT) {
    return createEmailEndpointAdapter(env.HANDOFF_EMAIL_ENDPOINT, fetchFn, log);
  }
  return createLogRedactedAdapter(log);
}

module.exports = {
  redactForLog,
  buildSummary,
  chooseRoute,
  createHandoffAdapter,
  createLogRedactedAdapter,
};
