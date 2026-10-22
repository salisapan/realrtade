// On Microsoft connect: persist encrypted refresh token + create inbox subscription.
// Project ref: zjquktirlrhbqcnkfaok only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { connectOutlookAccount } from '../outlook-graph-glance/lib/connect.mjs';
import { createStore } from '../outlook-graph-glance/lib/supabase-store.mjs';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const jobSecret = Deno.env.get('OUTLOOK_GRAPH_JOB_SECRET');
  if (jobSecret) {
    const provided = req.headers.get('x-outlook-graph-secret');
    if (provided !== jobSecret) return new Response('Unauthorized', { status: 401 });
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const userId = body.user_id;
  const refreshToken = body.refresh_token;
  const tenantId = body.tenant_id;
  if (!userId || !refreshToken) return new Response('Missing user_id or refresh_token', { status: 400 });

  const notificationUrl = Deno.env.get('OUTLOOK_GRAPH_NOTIFICATION_URL');
  const clientState = Deno.env.get('OUTLOOK_GRAPH_CLIENT_STATE');
  if (!notificationUrl || !clientState) return new Response('Server not configured', { status: 500 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const store = createStore(supabase, {
    OUTLOOK_TOKEN_ENCRYPTION_KEY: Deno.env.get('OUTLOOK_TOKEN_ENCRYPTION_KEY'),
    OUTLOOK_GRAPH_CLIENT_STATE_PEPPER: Deno.env.get('OUTLOOK_GRAPH_CLIENT_STATE_PEPPER'),
    OUTLOOK_GRAPH_CLIENT_STATE: clientState,
    MICROSOFT_CLIENT_ID: Deno.env.get('MICROSOFT_CLIENT_ID'),
    MICROSOFT_CLIENT_SECRET: Deno.env.get('MICROSOFT_CLIENT_SECRET')
  });

  try {
    const result = await connectOutlookAccount(store, {
      userId,
      refreshToken,
      tenantId,
      notificationUrl,
      clientState,
      nowMs: Date.now()
    });
    return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('connect error', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
