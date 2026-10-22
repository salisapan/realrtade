// Outlook server-side marker for flow-ai (zjquktirlrhbqcnkfaok only). Code only — not deployed from this PR.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { judgeOutlookInboxMessage } from "./judge.bundle.mjs";
import {
  alreadyMarked,
  clientStateForUser,
  doItLane,
  escapeValidationToken,
  markPatch,
  nextDeltaPath,
  parseDeltaPage,
  resolveAccountForNotification,
  shouldPersistRotatedRefresh,
  subscriptionExpirationIso,
  subscriptionNeedsRenewal,
  subscriptionRequestBody,
} from "./marker-core.mjs";

const PROJECT_REF = "zjquktirlrhbqcnkfaok";
const GRAPH = "https://graph.microsoft.com/v1.0";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

function env(name: string) {
  return Deno.env.get(name) || "";
}

function clientSecret() {
  return env("OUTLOOK_GRAPH_CLIENT_STATE_SECRET") || env("OUTLOOK_GRAPH_CLIENT_STATE");
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
  return {
    ok: true,
    accessToken: json.access_token,
    refreshToken: json.refresh_token || refreshToken,
    rotated: Boolean(json.refresh_token && json.refresh_token !== refreshToken),
  };
}

async function readRefreshToken(supabase: ReturnType<typeof createClient>, secretId: string) {
  const { data, error } = await supabase.rpc("outlook_marker_read_refresh", { secret_id: secretId });
  if (error) return null;
  return typeof data === "string" ? data : null;
}

async function writeRefreshToken(supabase: ReturnType<typeof createClient>, secretId: string, token: string) {
  const { error } = await supabase.rpc("outlook_marker_write_refresh", { secret_id: secretId, token });
  return !error;
}

async function ensureAccessToken(supabase: ReturnType<typeof createClient>, row: any) {
  const refresh = await readRefreshToken(supabase, row.refresh_secret_id);
  if (!refresh) return null;
  const refreshed = await refreshAccessToken(refresh);
  if (!refreshed.ok || !refreshed.accessToken) return null;
  if (shouldPersistRotatedRefresh(refresh, refreshed.refreshToken)) {
    await writeRefreshToken(supabase, row.refresh_secret_id, refreshed.refreshToken);
  }
  return refreshed.accessToken;
}

async function loadAllAccounts(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("outlook_graph_accounts")
    .select("user_id, mailbox, refresh_secret_id, subscription_id, subscription_expires_at, delta_link, own_addresses, client_state");
  if (error || !data) return [];
  return data;
}

async function loadAccount(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await supabase
    .from("outlook_graph_accounts")
    .select("user_id, mailbox, refresh_secret_id, subscription_id, subscription_expires_at, delta_link, own_addresses, client_state")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

function subscriptionMap(rows: any[]) {
  const map: Record<string, any> = {};
  (rows || []).forEach((row) => {
    if (row && row.subscription_id) map[row.subscription_id] = row;
  });
  return map;
}

async function renewSubscription(token: string, row: any, notificationUrl: string) {
  if (!subscriptionNeedsRenewal(row.subscription_expires_at)) return row;
  const clientState = row.client_state || clientStateForUser(row.user_id, clientSecret());
  const expiresAt = subscriptionExpirationIso();
  const body = subscriptionRequestBody(notificationUrl, clientState, expiresAt);
  const res = await graphFetch(token, row.subscription_id ? "/subscriptions/" + row.subscription_id : "/subscriptions", {
    method: row.subscription_id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.json) return row;
  return {
    ...row,
    subscription_id: res.json.id || row.subscription_id,
    subscription_expires_at: res.json.expirationDateTime || expiresAt,
    client_state: clientState,
  };
}

async function deltaCatchUp(token: string, storedDeltaLink: string | null) {
  let path = nextDeltaPath(storedDeltaLink, GRAPH);
  const messages: any[] = [];
  let deltaLink: string | null = storedDeltaLink;
  while (path) {
    const res = await graphFetch(token, path);
    if (!res.ok || !res.json) break;
    const page = parseDeltaPage(res.json);
    page.messages.forEach((m) => messages.push(m));
    if (page.deltaLink) {
      deltaLink = page.deltaLink;
      break;
    }
    if (page.nextLink) {
      path = nextDeltaPath(page.nextLink, GRAPH);
      continue;
    }
    break;
  }
  return { messages, deltaLink };
}

async function processMessage(token: string, message: any, ownAddresses: string[]) {
  if (alreadyMarked(message)) return { skipped: "already-marked" };
  const decision = judgeOutlookInboxMessage(message, ownAddresses);
  if (!doItLane(decision)) return { judged: true, marked: false };
  const flagged = message.flag && message.flag.flagStatus === "flagged";
  const patch = markPatch(message.categories || [], flagged);
  const marked = await graphFetch(token, "/me/messages/" + encodeURIComponent(message.id), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return { judged: true, marked: marked.ok, status: marked.status };
}

async function runAccountMaintenance(supabase: ReturnType<typeof createClient>, row: any, notificationUrl: string) {
  const token = await ensureAccessToken(supabase, row);
  if (!token) return { user_id: row.user_id, error: "token" };
  let current = row;
  const renewed = await renewSubscription(token, current, notificationUrl);
  if (renewed !== current) current = renewed;
  const delta = await deltaCatchUp(token, current.delta_link);
  const outcomes: any[] = [];
  for (const msg of delta.messages) {
    outcomes.push(await processMessage(token, msg, current.own_addresses || []));
  }
  await supabase.from("outlook_graph_accounts").update({
    subscription_id: current.subscription_id,
    subscription_expires_at: current.subscription_expires_at,
    client_state: current.client_state,
    delta_link: delta.deltaLink || current.delta_link,
    updated_at: new Date().toISOString(),
  }).eq("user_id", current.user_id);
  return { user_id: current.user_id, renewed: renewed !== row, delta: delta.messages.length, outcomes };
}

async function handleNotifications(supabase: ReturnType<typeof createClient>, payload: any) {
  const list = Array.isArray(payload.value) ? payload.value : [];
  const allRows = await loadAllAccounts(supabase);
  const bySub = subscriptionMap(allRows);
  const secret = clientSecret();
  const notificationUrl = env("OUTLOOK_GRAPH_NOTIFICATION_URL");
  const results: any[] = [];
  for (const note of list) {
    const row = resolveAccountForNotification(note, bySub, secret);
    if (!row || !row.user_id) {
      results.push({ skipped: "clientState" });
      continue;
    }
    const full = await loadAccount(supabase, row.user_id);
    if (!full) {
      results.push({ skipped: "account" });
      continue;
    }
    const token = await ensureAccessToken(supabase, full);
    if (!token) {
      results.push({ skipped: "token" });
      continue;
    }
    const resourceId = note.resourceData && note.resourceData.id;
    if (!resourceId) {
      results.push({ skipped: "resource" });
      continue;
    }
    const got = await graphFetch(
      token,
      "/me/messages/" + encodeURIComponent(resourceId) + "?$select=id,subject,body,bodyPreview,from,hasAttachments,categories,flag,singleValueExtendedProperties",
    );
    if (!got.ok || !got.json) {
      results.push({ skipped: "get", status: got.status });
      continue;
    }
    results.push(await processMessage(token, got.json, full.own_addresses || []));
  }
  return results;
}

async function handleScheduled(supabase: ReturnType<typeof createClient>) {
  const notificationUrl = env("OUTLOOK_GRAPH_NOTIFICATION_URL");
  const rows = await loadAllAccounts(supabase);
  const out: any[] = [];
  for (const row of rows) {
    out.push(await runAccountMaintenance(supabase, row, notificationUrl));
  }
  return out;
}

function validationResponse(token: string) {
  const safe = escapeValidationToken(token);
  return new Response(safe, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const validation = url.searchParams.get("validationToken");
  if (validation) return validationResponse(validation);

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const ref = env("SUPABASE_PROJECT_REF") || env("SUPABASE_URL");
  if (ref && ref.indexOf("nlvljclvoguvrnntwufu") >= 0) {
    return new Response("wrong project", { status: 500 });
  }

  let payload: any = {};
  const scheduled = url.searchParams.get("cron") === "1" || url.searchParams.get("scheduled") === "1";
  if (!scheduled) {
    try {
      payload = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (payload && payload.validationToken) return validationResponse(payload.validationToken);
  }

  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const work = scheduled
    ? handleScheduled(supabase)
    : handleNotifications(supabase, payload);

  EdgeRuntime.waitUntil(
    work.then((results) => {
      console.log(JSON.stringify({ project: PROJECT_REF, scheduled, results }));
    }),
  );

  return new Response(JSON.stringify({ project: PROJECT_REF, accepted: true, scheduled }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
});
