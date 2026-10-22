// Outlook Graph change notifications → Glance category marker.
// Deploy only to flow-ai project zjquktirlrhbqcnkfaok (supabase/config.toml).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { handleGraphNotificationRequest } from './lib/notify-handler.mjs';
import { createStore } from './lib/supabase-store.mjs';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

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
    return await handleGraphNotificationRequest(req, store);
  } catch (e) {
    console.error('notify error', e);
    return new Response('Internal error', { status: 500 });
  }
});
