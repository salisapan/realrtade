-- Outlook Graph "Glance" category marker (flow-ai project zjquktirlrhbqcnkfaok ONLY).
-- NOT applied by agents. David applies via supabase link + db push when ready.
-- Never run against nlvljclvoguvrnntwufu (RealTrade).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Microsoft refresh tokens: Mail.ReadWrite + offline_access only.
CREATE TABLE IF NOT EXISTS public.outlook_graph_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id text,
  refresh_token_enc bytea NOT NULL,
  token_nonce bytea NOT NULL,
  scopes text NOT NULL DEFAULT 'Mail.ReadWrite offline_access',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.outlook_graph_accounts IS
  'Encrypted refresh tokens for Graph. Plaintext never stored. Key: OUTLOOK_TOKEN_ENCRYPTION_KEY env.';

CREATE TABLE IF NOT EXISTS public.outlook_graph_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.outlook_graph_accounts (user_id) ON DELETE CASCADE,
  graph_subscription_id text NOT NULL UNIQUE,
  resource text NOT NULL,
  change_type text NOT NULL,
  client_state_hash bytea NOT NULL,
  expiration timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outlook_graph_subscriptions_exp_idx
  ON public.outlook_graph_subscriptions (expiration);

CREATE TABLE IF NOT EXISTS public.outlook_graph_delta (
  user_id uuid PRIMARY KEY REFERENCES public.outlook_graph_accounts (user_id) ON DELETE CASCADE,
  delta_link text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Message ids only — no mail content.
CREATE TABLE IF NOT EXISTS public.outlook_glance_marked (
  user_id uuid NOT NULL REFERENCES public.outlook_graph_accounts (user_id) ON DELETE CASCADE,
  message_id text NOT NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

CREATE TABLE IF NOT EXISTS public.outlook_glance_dismissed (
  user_id uuid NOT NULL REFERENCES public.outlook_graph_accounts (user_id) ON DELETE CASCADE,
  message_id text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

-- Undo after close: was the message marked before we stripped Glance (no mail content).
CREATE TABLE IF NOT EXISTS public.outlook_glance_undo_snap (
  user_id uuid NOT NULL REFERENCES public.outlook_graph_accounts (user_id) ON DELETE CASCADE,
  message_id text NOT NULL,
  was_marked boolean NOT NULL DEFAULT false,
  categories_json text NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

ALTER TABLE public.outlook_graph_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlook_graph_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlook_graph_delta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlook_glance_marked ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlook_glance_dismissed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlook_glance_undo_snap ENABLE ROW LEVEL SECURITY;

-- Service role only (edge functions). No anon access.
CREATE POLICY outlook_graph_accounts_service ON public.outlook_graph_accounts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY outlook_graph_subscriptions_service ON public.outlook_graph_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY outlook_graph_delta_service ON public.outlook_graph_delta
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY outlook_glance_marked_service ON public.outlook_glance_marked
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY outlook_glance_dismissed_service ON public.outlook_glance_dismissed
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY outlook_glance_undo_snap_service ON public.outlook_glance_undo_snap
  FOR ALL USING (auth.role() = 'service_role');
