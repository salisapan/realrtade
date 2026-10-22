// Scheduled: renew subscriptions (<7d) + inbox delta catch-up.
// Project ref: zjquktirlrhbqcnkfaok only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { renewExpiringSubscriptions, runDeltaForAllUsers } from '../outlook-graph-glance/lib/jobs.mjs';
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

  const url = new URL(req.url);
  const job = url.searchParams.get('job') || 'all';
  const nowMs = Date.now();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const store = createStore(supabase, {
    OUTLOOK_TOKEN_ENCRYPTION_KEY: Deno.env.get('OUTLOOK_TOKEN_ENCRYPTION_KEY'),
    OUTLOOK_GRAPH_CLIENT_STATE_PEPPER: Deno.env.get('OUTLOOK_GRAPH_CLIENT_STATE_PEPPER'),
    OUTLOOK_GRAPH_CLIENT_STATE: Deno.env.get('OUTLOOK_GRAPH_CLIENT_STATE'),
    MICROSOFT_CLIENT_ID: Deno.env.get('MICROSOFT_CLIENT_ID'),
    MICROSOFT_CLIENT_SECRET: Deno.env.get('MICROSOFT_CLIENT_SECRET')
  });

  try {
    const out: Record<string, unknown> = {};
    if (job === 'renew' || job === 'all') out.renew = await renewExpiringSubscriptions(store, nowMs);
    if (job === 'delta' || job === 'all') out.delta = await runDeltaForAllUsers(store, nowMs);
    return new Response(JSON.stringify(out), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('jobs error', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
