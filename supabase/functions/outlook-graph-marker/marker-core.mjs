// Portable marker logic (mirror of flow-trial-extension/core/outlook-graph-marker.js).
import { createHmac, timingSafeEqual } from "node:crypto";

export const GLANCE_CATEGORY = "Glance";
export const EXTENSION_FLAG = "glanceServerMarker";
export const EXT_PROPERTY_ID = "String {66f5a359-4659-4830-9070-00047ec6ac6e} Name " + EXTENSION_FLAG;
export const RENEW_WITHIN_MS = 24 * 60 * 60 * 1000;
export const MAIL_SUBSCRIPTION_MAX_MINUTES = 4230;
export const CHANGE_TYPE = "created";

export function constantTimeEqual(a, b) {
  const x = Buffer.from(String(a || ""), "utf8");
  const y = Buffer.from(String(b || ""), "utf8");
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export function clientStateForUser(userId, secret) {
  const id = String(userId || "").trim();
  const key = String(secret || "");
  if (!id || !key) return "";
  const tag = createHmac("sha256", key).update(id, "utf8").digest("hex").slice(0, 32);
  return id + ":" + tag;
}

export function userIdFromClientState(state) {
  const s = String(state || "");
  const i = s.indexOf(":");
  return i > 0 ? s.slice(0, i) : "";
}

export function validateClientStateForUser(got, userId, secret) {
  const expected = clientStateForUser(userId, secret);
  return expected.length >= 10 && constantTimeEqual(got, expected);
}

export function validateClientStateForRow(row, got) {
  if (!row || !got) return false;
  if (row.client_state && constantTimeEqual(got, row.client_state)) return true;
  return false;
}

export function resolveAccountForNotification(note, rowBySubscription, secret) {
  const subId = note && note.subscriptionId;
  if (subId && rowBySubscription && rowBySubscription[subId]) {
    const row = rowBySubscription[subId];
    if (validateClientStateForRow(row, note.clientState)) return row;
    return null;
  }
  const uid = userIdFromClientState(note && note.clientState);
  if (!uid) return null;
  if (secret && validateClientStateForUser(note.clientState, uid, secret)) return { user_id: uid, client_state: note.clientState };
  return null;
}

export function subscriptionNeedsRenewal(expiresAtIso, nowMs) {
  if (!expiresAtIso) return true;
  const end = Date.parse(expiresAtIso);
  if (Number.isNaN(end)) return true;
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  return end - now < RENEW_WITHIN_MS;
}

export function subscriptionExpirationIso(nowMs) {
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  return new Date(now + MAIL_SUBSCRIPTION_MAX_MINUTES * 60 * 1000).toISOString();
}

export function subscriptionRequestBody(notificationUrl, clientState, expiresAtIso) {
  return {
    changeType: CHANGE_TYPE,
    notificationUrl,
    resource: "/me/mailFolders('inbox')/messages",
    expirationDateTime: expiresAtIso,
    clientState,
  };
}

export function hasMarkerProperty(message) {
  const list = message && message.singleValueExtendedProperties;
  if (!Array.isArray(list)) return false;
  return list.some((p) => p && (p.id === EXT_PROPERTY_ID || String(p.id || "").indexOf(EXTENSION_FLAG) >= 0) && p.value === "1");
}

export function alreadyMarked(message) {
  if (!message) return false;
  const cats = message.categories || [];
  if (Array.isArray(cats) && cats.indexOf(GLANCE_CATEGORY) >= 0) return true;
  if (message.flag && message.flag.flagStatus === "flagged") return true;
  if (hasMarkerProperty(message)) return true;
  return false;
}

export function doItLane(decision) {
  if (!decision || decision.show !== true) return false;
  const steps = (decision.process && decision.process.steps) || [];
  return steps.some((s) => s && (s.kind === "outlookDraft" || s.kind === "outlookTask"));
}

export function markPatch(existingCategories, alreadyFlagged) {
  const cats = Array.isArray(existingCategories) ? existingCategories.slice() : [];
  if (cats.indexOf(GLANCE_CATEGORY) < 0) cats.push(GLANCE_CATEGORY);
  const patch = {
    categories: cats,
    flag: { flagStatus: "flagged" },
    singleValueExtendedProperties: [{ id: EXT_PROPERTY_ID, value: "1" }],
  };
  if (alreadyFlagged) delete patch.flag;
  return patch;
}

export function parseDeltaPage(json) {
  const body = json || {};
  return {
    messages: Array.isArray(body.value) ? body.value : [],
    nextLink: body["@odata.nextLink"] || null,
    deltaLink: body["@odata.deltaLink"] || null,
  };
}

export function nextDeltaPath(deltaLink, graphBase) {
  const base = graphBase || "https://graph.microsoft.com/v1.0";
  if (!deltaLink) {
    return "/me/mailFolders/inbox/messages/delta?$select=id,subject,body,bodyPreview,from,hasAttachments,categories,flag,singleValueExtendedProperties";
  }
  if (deltaLink.indexOf(base) === 0) return deltaLink.slice(base.length);
  if (deltaLink.indexOf("/me/") >= 0) return deltaLink.replace(base, "");
  return null;
}

export function escapeValidationToken(token) {
  return String(token || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function shouldPersistRotatedRefresh(oldToken, newToken) {
  return Boolean(newToken && oldToken && !constantTimeEqual(oldToken, newToken));
}
