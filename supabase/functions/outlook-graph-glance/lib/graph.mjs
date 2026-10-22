import {
  GLANCE_CATEGORY,
  GRAPH_SUBSCRIPTION_MAX_MINUTES,
  MESSAGE_SELECT,
  SUBSCRIPTION_CHANGE_TYPE,
  SUBSCRIPTION_RESOURCE
} from './constants.mjs';

export { GRAPH_SUBSCRIPTION_MAX_MINUTES, GLANCE_CATEGORY };

export function validationEchoResponse(validationToken) {
  const token = String(validationToken || '');
  return { status: 200, body: token, contentType: 'text/plain; charset=utf-8' };
}

export function graphBase() {
  return 'https://graph.microsoft.com/v1.0';
}

export async function graphFetch(accessToken, path, init) {
  const url = path.startsWith('http') ? path : graphBase() + path;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      ...(init && init.headers)
    }
  });
  return res;
}

export async function refreshAccessToken({ tenantId, clientId, clientSecret, refreshToken }) {
  const tenant = tenantId || 'common';
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'https://graph.microsoft.com/Mail.ReadWrite offline_access'
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || 'token_refresh_failed');
  return json;
}

export function subscriptionExpirationIso(nowMs) {
  const maxMs = GRAPH_SUBSCRIPTION_MAX_MINUTES * 60 * 1000;
  return new Date(nowMs + maxMs - 60 * 1000).toISOString();
}

export async function createInboxSubscription(accessToken, notificationUrl, clientState, nowMs) {
  const payload = {
    changeType: SUBSCRIPTION_CHANGE_TYPE,
    notificationUrl,
    resource: SUBSCRIPTION_RESOURCE,
    expirationDateTime: subscriptionExpirationIso(nowMs),
    clientState
  };
  const res = await graphFetch(accessToken, '/subscriptions', { method: 'POST', body: JSON.stringify(payload) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'subscription_create_failed');
  return json;
}

export async function renewSubscription(accessToken, subscriptionId, nowMs) {
  const payload = { expirationDateTime: subscriptionExpirationIso(nowMs) };
  const res = await graphFetch(accessToken, `/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'subscription_renew_failed');
  return json;
}

export function subscriptionsNeedingRenewal(rows, nowMs) {
  const cutoff = nowMs + 7 * 24 * 60 * 60 * 1000;
  return (rows || []).filter((r) => {
    const exp = Date.parse(r.expiration);
    return Number.isFinite(exp) && exp < cutoff;
  });
}

export async function getMessage(accessToken, messageId) {
  const res = await graphFetch(
    accessToken,
    `/me/messages/${encodeURIComponent(messageId)}?$select=${MESSAGE_SELECT}`
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'message_get_failed');
  return json;
}

export function bodyTextFromGraphMessage(msg) {
  const body = msg && msg.body;
  if (!body) return String(msg?.bodyPreview || '');
  const content = String(body.content || '');
  if ((body.contentType || '').toLowerCase() === 'html') {
    return content
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return content.trim() || String(msg.bodyPreview || '');
}

export function categoriesWithGlance(existing) {
  const base = Array.isArray(existing) ? existing.filter(Boolean) : [];
  if (base.includes(GLANCE_CATEGORY)) return base;
  return base.concat([GLANCE_CATEGORY]);
}

export function categoriesWithoutGlance(existing) {
  return (Array.isArray(existing) ? existing : []).filter((c) => c !== GLANCE_CATEGORY);
}

export function patchForMark(existingCategories) {
  return {
    categories: categoriesWithGlance(existingCategories),
    flag: { flagStatus: 'flagged' }
  };
}

export function patchForUnmark(existingCategories) {
  return {
    categories: categoriesWithoutGlance(existingCategories),
    flag: { flagStatus: 'notFlagged' }
  };
}

export async function patchMessage(accessToken, messageId, patch) {
  const res = await graphFetch(accessToken, `/me/messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  if (res.status === 204) return {};
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'message_patch_failed');
  return json;
}

export async function runDelta(accessToken, deltaLinkOrNull) {
  const path = deltaLinkOrNull || "/me/mailFolders/inbox/messages/delta?$select=id";
  const res = await graphFetch(accessToken, path);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'delta_failed');
  const ids = [];
  for (const row of json.value || []) {
    if (row && row.id) ids.push(row.id);
  }
  return {
    ids,
    deltaLink: json['@odata.deltaLink'] || null,
    nextLink: json['@odata.nextLink'] || null
  };
}
