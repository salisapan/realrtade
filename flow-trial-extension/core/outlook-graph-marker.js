// Server-side Outlook marker (task O): Graph change notifications, in-memory judge, category flag.
// Portable: no chrome.*, no DOM. Mail.ReadWrite only; never Mail.Send.
const FlowOutlookGraphMarker = (() => {
  const GLANCE_CATEGORY = 'Glance';
  const EXTENSION_FLAG = 'glanceServerMarker';
  const RENEW_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;
  const MAIL_SCOPE = 'Mail.ReadWrite';

  function validateClientState(expected, got) {
    const want = String(expected || '');
    const have = String(got || '');
    return want.length >= 8 && have === want;
  }

  function subscriptionNeedsRenewal(expiresAtIso, nowMs) {
    if (!expiresAtIso) return true;
    const end = Date.parse(expiresAtIso);
    if (Number.isNaN(end)) return true;
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    return end - now < RENEW_WITHIN_MS;
  }

  function notificationResourceIds(notifications) {
    const out = [];
    (notifications || []).forEach((n) => {
      const data = n && n.resourceData;
      const id = data && (data.id || data['@odata.id']);
      if (typeof id === 'string' && id) out.push(id);
    });
    return out;
  }

  function doItLane(decision) {
    if (!decision || decision.show !== true) return false;
    const steps = (decision.process && decision.process.steps) || [];
    return steps.some((s) => s && (s.kind === 'outlookDraft' || s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks'));
  }

  function categoryPatch(existing) {
    const cats = Array.isArray(existing) ? existing.slice() : [];
    if (cats.indexOf(GLANCE_CATEGORY) < 0) cats.push(GLANCE_CATEGORY);
    return {
      categories: cats,
      singleValueExtendedProperties: [{
        id: 'String {66f5a359-4659-4830-9070-00047ec6ac6e} Name ' + EXTENSION_FLAG,
        value: '1'
      }]
    };
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

  return {
    GLANCE_CATEGORY: GLANCE_CATEGORY,
    EXTENSION_FLAG: EXTENSION_FLAG,
    MAIL_SCOPE: MAIL_SCOPE,
    RENEW_WITHIN_MS: RENEW_WITHIN_MS,
    validateClientState: validateClientState,
    subscriptionNeedsRenewal: subscriptionNeedsRenewal,
    notificationResourceIds: notificationResourceIds,
    doItLane: doItLane,
    categoryPatch: categoryPatch,
    refreshBody: refreshBody
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookGraphMarker };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookGraphMarker = FlowOutlookGraphMarker;
