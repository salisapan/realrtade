// Meta WhatsApp Cloud API webhook (W4). Service role writes only; user JWT never in the body.
// Secrets (set in Supabase dashboard, never in git): WA_META_APP_SECRET, WA_META_VERIFY_TOKEN

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  parseInboundMessages,
  storeInboundMessages,
  verifyHubSignature,
  verifyTokenHandshake,
} from "../_shared/wa-cloud-logic.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_SECRET = Deno.env.get("WA_META_APP_SECRET") ?? "";
const VERIFY_TOKEN = Deno.env.get("WA_META_VERIFY_TOKEN") ?? "";

async function hmacSha256(_alg: string, data: Uint8Array, key: Uint8Array): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, data);
}

async function globalKillActive(admin: ReturnType<typeof createClient>): Promise<boolean> {
  const { data, error } = await admin
    .from("wa_business_platform")
    .select("kill_switch")
    .eq("id", "global")
    .maybeSingle();
  if (error) {
    console.error("wa_business_platform read failed", error.message);
    return true;
  }
  return Boolean(data && data.kill_switch === true);
}

function memoryStoreFromDb(rows: { wamid: string }[]) {
  const set = new Set(rows.map((r) => r.wamid));
  return {
    has: (wamid: string) => set.has(wamid),
    add: (row: { wamid: string }) => {
      set.add(row.wamid);
    },
  };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const hand = verifyTokenHandshake(url.searchParams, VERIFY_TOKEN);
    if (!hand.ok) {
      return new Response(hand.forbidden ? "Forbidden" : "Bad request", {
        status: hand.forbidden ? 403 : 400,
      });
    }
    return new Response(hand.challenge, { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!SUPABASE_URL || !SERVICE_KEY || !APP_SECRET) {
    console.error("Webhook not configured");
    return new Response("Server not configured", { status: 500 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  const valid = await verifyHubSignature(rawBody, sig, APP_SECRET, hmacSha256);
  if (!valid) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (await globalKillActive(admin)) {
    return new Response(JSON.stringify({ ok: true, stored: 0, killed: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = parseInboundMessages(payload);
  if (!parsed.length) {
    return new Response(JSON.stringify({ ok: true, stored: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const wamids = parsed.map((p) => p.wamid);
  const { data: existing } = await admin
    .from("wa_business_inbound_messages")
    .select("wamid")
    .in("wamid", wamids);
  const mem = memoryStoreFromDb(existing || []);
  const batch = storeInboundMessages(parsed, mem, { globalKill: false });

  for (const row of batch.rows) {
    const { error } = await admin.from("wa_business_inbound_messages").upsert(
      {
        wamid: row.wamid,
        phone_number_id: row.phoneNumberId,
        from_wa_id: row.fromWaId,
        contact_name: row.contactName,
        message_type: row.messageType,
        text_body: row.textBody || null,
        caption: row.caption || null,
        mime_type: row.mimeType || null,
        media_sha256: row.mediaSha256 || null,
        media_id: row.mediaId || null,
        filename: row.filename || null,
        media_bytes: null,
        received_at: row.timestamp
          ? new Date(Number(row.timestamp) * 1000).toISOString()
          : new Date().toISOString(),
        raw_payload: payload,
      },
      { onConflict: "wamid", ignoreDuplicates: true },
    );
    if (error) {
      console.error("insert failed", row.wamid, error.message);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      stored: batch.inserted,
      duplicates: batch.duplicates,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
