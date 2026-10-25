// Server-side Outlook marker (task O): Graph notifications, judge, visible flag + category.
// Portable: no chrome.*, no DOM. Mail.ReadWrite only; never Mail.Send.
const crypto = require('crypto');

const FlowOutlookGraphMarker = (() => {
  const GLANCE_CATEGORY = 'Glance';
  const EXTENSION_FLAG = 'glanceServerMarker';
  const EXT_PROPERTY_ID = 'String {66f5a359-4659-4830-9070-00047ec6ac6e} Name ' + EXTENSION_FLAG;
  const RENEW_WITHIN_MS = 24 * 60 * 60 * 1000;
  const MAIL_SUBSCRIPTION_MAX_MINUTES = 4200;
  const INITIAL_DELTA_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;
  const MAX_DELTA_PAGES = 12;
  const MAINTENANCE_WALL_MS = 149000;
  const MAIL_SCOPE = 'Mail.ReadWrite';
  const CHANGE_TYPE = 'created';
  const CRON_HEADER = 'x-glance-cron';

  function constantTimeEqual(a, b) {
    const x = Buffer.from(String(a || ''), 'utf8');
    const y = Buffer.from(String(b || ''), 'utf8');
    if (x.length !== y.length) return false;
    return crypto.timingSafeEqual(x, y);
  }

  function assertStorageSecret(value) {
    if (value != null && typeof Uint8Array !== 'undefined' && value instanceof Uint8Array) {
      throw new Error('storage secrets must be base64 text, never Uint8Array');
    }
    return String(value == null ? '' : value);
  }

  function clientStateTagBase64(userId, secret) {
    const id = String(userId || '').trim();
    const key = String(secret || '');
    if (!id || !key) return '';
    return crypto.createHmac('sha256', key).update(id, 'utf8').digest('base64url').slice(0, 32);
  }

  function clientStateForUser(userId, secret) {
    const id = String(userId || '').trim();
    const tag = clientStateTagBase64(userId, secret);
    if (!id || !tag) return '';
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

  function snapshotBeforeMark(message) {
    const msg = message || {};
    const flagged = msg.flag && msg.flag.flagStatus === 'flagged';
    return {
      categories: Array.isArray(msg.categories) ? msg.categories.slice() : [],
      flagStatus: flagged ? 'flagged' : 'notFlagged',
      glanceWillSetFlag: !flagged
    };
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

  function unmarkPatch(message, snapshot) {
    const msg = message || {};
    const snap = snapshot || null;
    const cats = (Array.isArray(msg.categories) ? msg.categories : []).filter((c) => c !== GLANCE_CATEGORY);
    const patch = {
      categories: cats,
      singleValueExtendedProperties: [{ id: EXT_PROPERTY_ID, value: null }]
    };
    if (!hasMarkerProperty(msg)) return patch;
    if (snap && snap.glanceWillSetFlag === false) {
      return patch;
    }
    if (snap && snap.glanceWillSetFlag) {
      patch.flag = { flagStatus: snap.flagStatus || 'notFlagged' };
    } else if (msg.flag && msg.flag.flagStatus === 'flagged') {
      patch.flag = { flagStatus: 'notFlagged' };
    }
    return patch;
  }

  function undoPatch(snapshot) {
    if (!snapshot) return null;
    const patch = {
      categories: Array.isArray(snapshot.categories) ? snapshot.categories.slice() : [],
      singleValueExtendedProperties: [{ id: EXT_PROPERTY_ID, value: null }]
    };
    if (snapshot.flagStatus) patch.flag = { flagStatus: snapshot.flagStatus };
    return patch;
  }

  function unmarkPatchForAction(message, snapshot, action) {
    if (action === 'undo') return undoPatch(snapshot);
    return unmarkPatch(message, snapshot);
  }

  function refreshTokenForVaultWrite(token) {
    return assertStorageSecret(token);
  }

  function maintenanceBudgetExceeded(startMs, nowMs) {
    const start = typeof startMs === 'number' ? startMs : Date.now();
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    return now - start >= MAINTENANCE_WALL_MS;
  }

  function judgeOptsForAccount(row) {
    const r = row || {};
    const own = Array.isArray(r.own_addresses) ? r.own_addresses : [];
    const names = Array.isArray(r.own_names) ? r.own_names : [];
    const userName = r.user_name != null && String(r.user_name).trim() !== '' ? String(r.user_name).trim() : null;
    return {
      userName: userName,
      ownNames: names.length ? names : null,
      namesPending: !userName && names.length === 0
    };
  }

  function readBackMarked(message) {
    if (!message) return { ok: false, reason: 'no-message' };
    const cats = message.categories || [];
    const category = Array.isArray(cats) && cats.indexOf(GLANCE_CATEGORY) >= 0;
    const flagged = message.flag && message.flag.flagStatus === 'flagged';
    const prop = hasMarkerProperty(message);
    return { ok: category && prop, category: category, flagged: flagged, property: prop, fetchedBack: true };
  }

  function odataQuote(value) {
    return "'" + String(value || '').replace(/'/g, "''") + "'";
  }

  function graphExpandExtendedProps() {
    return '$expand=singleValueExtendedProperties($filter=id eq ' + odataQuote(EXT_PROPERTY_ID) + ')';
  }

  function graphMessageSelectFields() {
    return 'id,subject,body,bodyPreview,from,toRecipients,ccRecipients,hasAttachments,categories,flag,receivedDateTime';
  }

  function graphMessageGetQuery() {
    return '$select=' + graphMessageSelectFields() + '&' + graphExpandExtendedProps();
  }

  function initialDeltaReceivedAfterIso(nowMs) {
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    return new Date(now - INITIAL_DELTA_LOOKBACK_MS).toISOString();
  }

  function messageWithinLookback(message, nowMs) {
    const iso = message && (message.receivedDateTime || message.sentDateTime);
    if (!iso) return true;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return true;
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    return t >= now - INITIAL_DELTA_LOOKBACK_MS;
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

  function nextDeltaPath(deltaLink, graphBase, opts) {
    const base = graphBase || 'https://graph.microsoft.com/v1.0';
    const o = opts || {};
    if (!deltaLink) {
      const after = initialDeltaReceivedAfterIso(o.nowMs);
      const filter = "$filter=receivedDateTime ge " + after;
      return '/me/mailFolders/inbox/messages/delta?$select=' + graphMessageSelectFields()
        + '&' + filter + '&' + graphExpandExtendedProps();
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

  function parseBearerAuthorization(authHeader) {
    const h = String(authHeader || '').trim();
    const m = /^Bearer\s+(\S+)/i.exec(h);
    return m ? m[1] : '';
  }

  // Unmark HTTP: caller must present a Supabase user JWT; body.userId is optional and must match.
  function authorizeUnmarkUser(jwtUserId, bodyUserId) {
    const uid = String(jwtUserId || '').trim();
    if (!uid) return { allowed: false, status: 401, reason: 'no-auth', userId: '' };
    const claimed = bodyUserId != null && String(bodyUserId).trim() !== '' ? String(bodyUserId).trim() : '';
    if (claimed && claimed !== uid) return { allowed: false, status: 403, reason: 'user-mismatch', userId: uid };
    return { allowed: true, status: 200, reason: 'ok', userId: uid };
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
    unmarkPatch: unmarkPatch,
    readBackMarked: readBackMarked,
    graphMessageGetQuery: graphMessageGetQuery,
    graphExpandExtendedProps: graphExpandExtendedProps,
    initialDeltaReceivedAfterIso: initialDeltaReceivedAfterIso,
    messageWithinLookback: messageWithinLookback,
    MAX_DELTA_PAGES: MAX_DELTA_PAGES,
    MAINTENANCE_WALL_MS: MAINTENANCE_WALL_MS,
    INITIAL_DELTA_LOOKBACK_MS: INITIAL_DELTA_LOOKBACK_MS,
    assertStorageSecret: assertStorageSecret,
    clientStateTagBase64: clientStateTagBase64,
    snapshotBeforeMark: snapshotBeforeMark,
    undoPatch: undoPatch,
    unmarkPatchForAction: unmarkPatchForAction,
    refreshTokenForVaultWrite: refreshTokenForVaultWrite,
    maintenanceBudgetExceeded: maintenanceBudgetExceeded,
    judgeOptsForAccount: judgeOptsForAccount,
    parseDeltaPage: parseDeltaPage,
    mergeDeltaPages: mergeDeltaPages,
    nextDeltaPath: nextDeltaPath,
    refreshBody: refreshBody,
    shouldPersistRotatedRefresh: shouldPersistRotatedRefresh,
    escapeValidationToken: escapeValidationToken,
    authorizeScheduledRequest: authorizeScheduledRequest,
    parseBearerAuthorization: parseBearerAuthorization,
    authorizeUnmarkUser: authorizeUnmarkUser
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookGraphMarker };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookGraphMarker = FlowOutlookGraphMarker;
