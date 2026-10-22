// Server-side Outlook marker (task O): Graph notifications, judge, visible flag + category.
// Portable: no chrome.*, no DOM. Mail.ReadWrite only; never Mail.Send.
const crypto = require('crypto');

const FlowOutlookGraphMarker = (() => {
  const GLANCE_CATEGORY = 'Glance';
  const EXTENSION_FLAG = 'glanceServerMarker';
  const EXT_PROPERTY_ID = 'String {66f5a359-4659-4830-9070-00047ec6ac6e} Name ' + EXTENSION_FLAG;
  const RENEW_WITHIN_MS = 24 * 60 * 60 * 1000;
  const MAIL_SUBSCRIPTION_MAX_MINUTES = 4230;
  const MAIL_SCOPE = 'Mail.ReadWrite';
  const CHANGE_TYPE = 'created';
  const CRON_HEADER = 'x-glance-cron';

  function constantTimeEqual(a, b) {
    const x = Buffer.from(String(a || ''), 'utf8');
    const y = Buffer.from(String(b || ''), 'utf8');
    if (x.length !== y.length) return false;
    return crypto.timingSafeEqual(x, y);
  }

  function clientStateForUser(userId, secret) {
    const id = String(userId || '').trim();
    const key = String(secret || '');
    if (!id || !key) return '';
    const tag = crypto.createHmac('sha256', key).update(id, 'utf8').digest('hex').slice(0, 32);
    return id + ':' + tag;
  }

  function userIdFromClientState(state) {
    const s = String(state || '');
    const i = s.indexOf(':');
    return i > 0 ? s.slice(0, i) : '';
  }

  function validateClientStateForUser(got, userId, secret) {
    const expected = clientStateForUser(userId, secret);
    return expected.length >= 10 && constantTimeEqual(got, expected);
  }

  function validateClientStateForRow(row, got) {
    if (!row || !got) return false;
    if (row.client_state && constantTimeEqual(got, row.client_state)) return true;
    return false;
  }

  function resolveAccountForNotification(note, rowBySubscription, secret) {
    const subId = note && note.subscriptionId;
    if (subId && rowBySubscription && rowBySubscription[subId]) {
      const row = rowBySubscription[subId];
      if (validateClientStateForRow(row, note.clientState)) return row;
      return null;
    }
    const uid = userIdFromClientState(note && note.clientState);
    if (!uid) return null;
    if (secret && validateClientStateForUser(note.clientState, uid, secret)) {
      return { user_id: uid, client_state: note.clientState };
    }
    return null;
  }

  function subscriptionNeedsRenewal(expiresAtIso, nowMs) {
    if (!expiresAtIso) return true;
    const end = Date.parse(expiresAtIso);
    if (Number.isNaN(end)) return true;
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    return end - now < RENEW_WITHIN_MS;
  }

  function subscriptionExpirationIso(nowMs) {
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    return new Date(now + MAIL_SUBSCRIPTION_MAX_MINUTES * 60 * 1000).toISOString();
  }

  function subscriptionRequestBody(notificationUrl, clientState, expiresAtIso) {
    return {
      changeType: CHANGE_TYPE,
      notificationUrl: notificationUrl,
      resource: "/me/mailFolders('inbox')/messages",
      expirationDateTime: expiresAtIso,
      clientState: clientState
    };
  }

  function hasMarkerProperty(message) {
    const list = message && message.singleValueExtendedProperties;
    if (!Array.isArray(list)) return false;
    return list.some((p) => p && (p.id === EXT_PROPERTY_ID || String(p.id || '').indexOf(EXTENSION_FLAG) >= 0) && p.value === '1');
  }

  function alreadyMarked(message) {
    if (!message) return false;
    const cats = message.categories || [];
    if (Array.isArray(cats) && cats.indexOf(GLANCE_CATEGORY) >= 0) return true;
    if (message.flag && message.flag.flagStatus === 'flagged') return true;
    if (hasMarkerProperty(message)) return true;
    return false;
  }

  function doItLane(decision) {
    if (!decision || decision.show !== true) return false;
    const steps = (decision.process && decision.process.steps) || [];
    return steps.some((s) => s && (s.kind === 'outlookDraft' || s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks'));
  }

  function markPatch(existingCategories, alreadyFlagged) {
    const cats = Array.isArray(existingCategories) ? existingCategories.slice() : [];
    if (cats.indexOf(GLANCE_CATEGORY) < 0) cats.push(GLANCE_CATEGORY);
    const patch = {
      categories: cats,
      flag: { flagStatus: 'flagged' },
      singleValueExtendedProperties: [{
        id: EXT_PROPERTY_ID,
        value: '1'
      }]
    };
    if (alreadyFlagged) delete patch.flag;
    return patch;
  }

  function parseDeltaPage(json) {
    const body = json || {};
    const messages = Array.isArray(body.value) ? body.value : [];
    const nextLink = body['@odata.nextLink'] || null;
    const deltaLink = body['@odata.deltaLink'] || null;
    return { messages, nextLink, deltaLink };
  }

  function mergeDeltaPages(pages) {
    const messages = [];
    let deltaLink = null;
    (pages || []).forEach((page) => {
      (page.messages || []).forEach((m) => messages.push(m));
      if (page.deltaLink) deltaLink = page.deltaLink;
    });
    return { messages, deltaLink };
  }

  function nextDeltaPath(deltaLink, graphBase) {
    const base = graphBase || 'https://graph.microsoft.com/v1.0';
    if (!deltaLink) {
      return "/me/mailFolders/inbox/messages/delta?$select=id,subject,body,bodyPreview,from,hasAttachments,categories,flag,singleValueExtendedProperties";
    }
    if (deltaLink.indexOf(base) === 0) return deltaLink.slice(base.length);
    if (deltaLink.indexOf('/me/') >= 0) return deltaLink.replace(base, '');
    return null;
  }

  function refreshBody(refreshToken, clientId, scope, pkceInterface) {
    const iface = pkceInterface || {};
    const grants = iface.grants && iface.grants.refresh_token;
    const body = {
      client_id: clientId,
      grant_type: (iface.grantTypes && iface.grantTypes.refresh) || 'refresh_token',
      refresh_token: refreshToken,
      scope: scope || MAIL_SCOPE
    };
    const out = {};
    (grants || Object.keys(body)).forEach((key) => {
      if (body[key] != null) out[key] = body[key];
    });
    return out;
  }

  function shouldPersistRotatedRefresh(oldToken, newToken) {
    return Boolean(newToken && oldToken && !constantTimeEqual(oldToken, newToken));
  }

  function escapeValidationToken(token) {
    return String(token || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function authorizeScheduledRequest(headerValue, configuredSecret) {
    const expected = String(configuredSecret || '');
    if (!expected) return false;
    return constantTimeEqual(String(headerValue || ''), expected);
  }

  return {
    GLANCE_CATEGORY: GLANCE_CATEGORY,
    EXTENSION_FLAG: EXTENSION_FLAG,
    EXT_PROPERTY_ID: EXT_PROPERTY_ID,
    MAIL_SCOPE: MAIL_SCOPE,
    RENEW_WITHIN_MS: RENEW_WITHIN_MS,
    MAIL_SUBSCRIPTION_MAX_MINUTES: MAIL_SUBSCRIPTION_MAX_MINUTES,
    CHANGE_TYPE: CHANGE_TYPE,
    CRON_HEADER: CRON_HEADER,
    constantTimeEqual: constantTimeEqual,
    clientStateForUser: clientStateForUser,
    userIdFromClientState: userIdFromClientState,
    validateClientStateForUser: validateClientStateForUser,
    validateClientStateForRow: validateClientStateForRow,
    resolveAccountForNotification: resolveAccountForNotification,
    subscriptionNeedsRenewal: subscriptionNeedsRenewal,
    subscriptionExpirationIso: subscriptionExpirationIso,
    subscriptionRequestBody: subscriptionRequestBody,
    alreadyMarked: alreadyMarked,
    doItLane: doItLane,
    markPatch: markPatch,
    parseDeltaPage: parseDeltaPage,
    mergeDeltaPages: mergeDeltaPages,
    nextDeltaPath: nextDeltaPath,
    refreshBody: refreshBody,
    shouldPersistRotatedRefresh: shouldPersistRotatedRefresh,
    escapeValidationToken: escapeValidationToken,
    authorizeScheduledRequest: authorizeScheduledRequest
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookGraphMarker };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookGraphMarker = FlowOutlookGraphMarker;
