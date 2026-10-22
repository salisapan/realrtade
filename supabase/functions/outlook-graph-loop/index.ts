// Close / Undo / Not-this parity with Gmail marker: strip or restore Glance category+flag.
// Project ref: zjquktirlrhbqcnkfaok only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { closeMessage, undoClose, notThis } from '../outlook-graph-glance/lib/loop-actions.mjs';
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

  let body: { action?: string; user_id?: string; message_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const action = body.action;
  const userId = body.user_id;
  const messageId = body.message_id;
  if (!action || !userId || !messageId) return new Response('Missing action, user_id, or message_id', { status: 400 });

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
    let result;
    if (action === 'close') result = await closeMessage(store, userId, messageId);
    else if (action === 'undo') result = await undoClose(store, userId, messageId);
    else if (action === 'not_this') result = await notThis(store, userId, messageId);
    else return new Response('Unknown action', { status: 400 });
    return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('loop error', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
