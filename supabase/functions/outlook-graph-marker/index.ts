// Outlook server-side marker for flow-ai (zjquktirlrhbqcnkfaok only). Code only — not deployed from this PR.
// Graph change notifications → clientState check → bundled core judge → Glance category + flag on Do It lanes.
// Tokens: refresh via C1 PKCE shape; storage in Vault/pgcrypto (see migration SQL, not applied).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { judgeOutlookInboxMessage } from "./judge.bundle.mjs";

const PROJECT_REF = "zjquktirlrhbqcnkfaok";
const GRAPH = "https://graph.microsoft.com/v1.0";

const GLANCE_CATEGORY = "Glance";
const EXT_FLAG = "glanceServerMarker";
const RENEW_MS = 7 * 24 * 60 * 60 * 1000;

function env(name: string) {
  return Deno.env.get(name) || "";
}

function validateClientState(got: string | null) {
  const expected = env("OUTLOOK_GRAPH_CLIENT_STATE");
  return expected.length >= 8 && got === expected;
}

function subscriptionNeedsRenewal(expiresAt: string | null) {
  if (!expiresAt) return true;
  const end = Date.parse(expiresAt);
  return Number.isNaN(end) || end - Date.now() < RENEW_MS;
}

async function graphFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(GRAPH + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
  });
  let json: any = null;
  try {
    if (res.status !== 204) json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json };
}

async function refreshAccessToken(refreshToken: string) {
  const tenant = env("MICROSOFT_TENANT_ID") || "common";
  const clientId = env("MICROSOFT_CLIENT_ID");
  const scope = env("MICROSOFT_SCOPE") || "offline_access Mail.ReadWrite";
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope,
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) return { ok: false, json };
  return { ok: true, accessToken: json.access_token, refreshToken: json.refresh_token || refreshToken, expiresIn: json.expires_in };
}

async function loadAccount(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await supabase
    .from("outlook_graph_accounts")
    .select("user_id, mailbox, refresh_secret_id, subscription_id, subscription_expires_at, delta_link, own_addresses")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function readRefreshToken(supabase: ReturnType<typeof createClient>, secretId: string) {
  const { data, error } = await supabase.rpc("outlook_marker_read_refresh", { secret_id: secretId });
  if (error) return null;
  return typeof data === "string" ? data : null;
}

async function ensureAccessToken(supabase: ReturnType<typeof createClient>, row: any) {
  const refresh = await readRefreshToken(supabase, row.refresh_secret_id);
  if (!refresh) return null;
  const refreshed = await refreshAccessToken(refresh);
  if (!refreshed.ok || !refreshed.accessToken) return null;
  return refreshed.accessToken;
}

async function renewSubscription(token: string, row: any) {
  if (!subscriptionNeedsRenewal(row.subscription_expires_at)) return row;
  const clientState = env("OUTLOOK_GRAPH_CLIENT_STATE");
  const notificationUrl = env("OUTLOOK_GRAPH_NOTIFICATION_URL");
  const body = {
    changeType: "created,updated",
    notificationUrl,
    resource: "/me/mailFolders('inbox')/messages",
    expirationDateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    clientState,
  };
  const res = await graphFetch(token, row.subscription_id ? "/subscriptions/" + row.subscription_id : "/subscriptions", {
    method: row.subscription_id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.json) return row;
  return {
    ...row,
    subscription_id: res.json.id || row.subscription_id,
    subscription_expires_at: res.json.expirationDateTime || row.subscription_expires_at,
  };
}

async function deltaCatchUp(token: string, deltaLink: string | null) {
  const path = deltaLink && deltaLink.indexOf("/me/") >= 0
    ? deltaLink.replace(GRAPH, "")
    : "/me/mailFolders/inbox/messages/delta?$select=id,subject,bodyPreview,from,hasAttachments,categories";
  const res = await graphFetch(token, path);
  if (!res.ok || !res.json) return { messages: [], deltaLink: deltaLink };
  const messages = Array.isArray(res.json.value) ? res.json.value : [];
  return { messages, deltaLink: res.json["@odata.deltaLink"] || res.json["@odata.nextLink"] || deltaLink };
}

function doItLane(decision: any) {
  if (!decision || decision.show !== true) return false;
  const steps = (decision.process && decision.process.steps) || [];
  return steps.some((s: any) => s && (s.kind === "outlookDraft" || s.kind === "outlookTask"));
}

async function markMessage(token: string, messageId: string, existingCategories: string[]) {
  const cats = Array.isArray(existingCategories) ? existingCategories.slice() : [];
  if (cats.indexOf(GLANCE_CATEGORY) < 0) cats.push(GLANCE_CATEGORY);
  const patch = {
    categories: cats,
    singleValueExtendedProperties: [{
      id: "String {66f5a359-4659-4830-9070-00047ec6ac6e} Name " + EXT_FLAG,
      value: "1",
    }],
  };
  return graphFetch(token, "/me/messages/" + encodeURIComponent(messageId), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

async function handleNotifications(supabase: ReturnType<typeof createClient>, payload: any) {
  const list = Array.isArray(payload.value) ? payload.value : [];
  const results: any[] = [];
  for (const note of list) {
    if (!validateClientState(note.clientState)) {
      results.push({ skipped: "clientState" });
      continue;
    }
    const userId = note.clientState && String(note.clientState).split(":")[0];
    if (!userId) {
      results.push({ skipped: "user" });
      continue;
    }
    const row = await loadAccount(supabase, userId);
    if (!row) {
      results.push({ skipped: "account" });
      continue;
    }
    let token = await ensureAccessToken(supabase, row);
    if (!token) {
      results.push({ skipped: "token" });
      continue;
    }
    const renewed = await renewSubscription(token, row);
    if (renewed !== row) {
      await supabase.from("outlook_graph_accounts").update({
        subscription_id: renewed.subscription_id,
        subscription_expires_at: renewed.subscription_expires_at,
      }).eq("user_id", userId);
    }
    const resourceId = note.resourceData && note.resourceData.id;
    if (!resourceId) {
      results.push({ skipped: "resource" });
      continue;
    }
    const got = await graphFetch(
      token,
      "/me/messages/" + encodeURIComponent(resourceId) + "?$select=id,subject,body,bodyPreview,from,hasAttachments,categories",
    );
    if (!got.ok || !got.json) {
      results.push({ skipped: "get", status: got.status });
      continue;
    }
    const me = Array.isArray(row.own_addresses) ? row.own_addresses : [];
    const decision = judgeOutlookInboxMessage(got.json, me);
    if (!doItLane(decision)) {
      results.push({ judged: true, marked: false });
      continue;
    }
    const marked = await markMessage(token, got.json.id, got.json.categories || []);
    results.push({ judged: true, marked: marked.ok, status: marked.status });
  }
  return results;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const validation = url.searchParams.get("validationToken");
  if (validation) {
    return new Response(validation, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const ref = env("SUPABASE_PROJECT_REF") || env("SUPABASE_URL");
  if (ref && ref.indexOf("nlvljclvoguvrnntwufu") >= 0) {
    return new Response("wrong project", { status: 500 });
  }
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  if (payload && payload.validationToken) {
    return new Response(payload.validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  const results = await handleNotifications(supabase, payload);
  return new Response(JSON.stringify({ project: PROJECT_REF, results }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
});
