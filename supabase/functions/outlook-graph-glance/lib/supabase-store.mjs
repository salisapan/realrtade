import { decryptRefreshToken, encryptRefreshToken } from './crypto.mjs';
import { refreshAccessToken } from './graph.mjs';

/** Factory for deps used by handlers (Supabase service client). */
export function createStore(supabase, env) {
  const key = env.OUTLOOK_TOKEN_ENCRYPTION_KEY;
  const pepper = env.OUTLOOK_GRAPH_CLIENT_STATE_PEPPER || env.OUTLOOK_GRAPH_CLIENT_STATE || '';

  async function getAccessTokenForUser(userId) {
    const { data, error } = await supabase
      .from('outlook_graph_accounts')
      .select('tenant_id, refresh_token_enc, token_nonce')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    const refreshToken = await decryptRefreshToken(data.refresh_token_enc, data.token_nonce, key);
    const token = await refreshAccessToken({
      tenantId: data.tenant_id,
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      refreshToken
    });
    if (token.refresh_token) {
      const enc = await encryptRefreshToken(token.refresh_token, key);
      await supabase
        .from('outlook_graph_accounts')
        .update({
          refresh_token_enc: enc.refresh_token_enc,
          token_nonce: enc.token_nonce,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
    }
    return { accessToken: token.access_token };
  }

  return {
    clientStatePepper: pepper,
    encryptRefreshToken: (rt) => encryptRefreshToken(rt, key),
    getAccessTokenForUser,
    async resolveUserFromNotification(note) {
      const subId = note?.subscriptionId;
      if (!subId) return null;
      const { data } = await supabase
        .from('outlook_graph_subscriptions')
        .select('user_id, client_state_hash')
        .eq('graph_subscription_id', subId)
        .maybeSingle();
      return data;
    },
    async getClientStateHashForUser(userId) {
      const { data } = await supabase
        .from('outlook_graph_subscriptions')
        .select('client_state_hash')
        .eq('user_id', userId)
        .order('expiration', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.client_state_hash ? new Uint8Array(data.client_state_hash) : null;
    },
    async isDismissed(userId, messageId) {
      const { data } = await supabase
        .from('outlook_glance_dismissed')
        .select('message_id')
        .eq('user_id', userId)
        .eq('message_id', messageId)
        .maybeSingle();
      return Boolean(data);
    },
    async isAlreadyMarked(userId, messageId) {
      const { data } = await supabase
        .from('outlook_glance_marked')
        .select('message_id')
        .eq('user_id', userId)
        .eq('message_id', messageId)
        .maybeSingle();
      return Boolean(data);
    },
    async recordMarked(userId, messageId) {
      await supabase.from('outlook_glance_marked').upsert({ user_id: userId, message_id: messageId });
    },
    async clearMarked(userId, messageId) {
      await supabase.from('outlook_glance_marked').delete().eq('user_id', userId).eq('message_id', messageId);
    },
    async recordDismissed(userId, messageId) {
      await supabase.from('outlook_glance_dismissed').upsert({ user_id: userId, message_id: messageId });
    },
    async clearDismissed(userId, messageId) {
      await supabase.from('outlook_glance_dismissed').delete().eq('user_id', userId).eq('message_id', messageId);
    },
    async rememberPreUndo(userId, messageId, wasMarked, categories) {
      await supabase.from('outlook_glance_undo_snap').upsert({
        user_id: userId,
        message_id: messageId,
        was_marked: wasMarked,
        categories_json: JSON.stringify(categories || [])
      });
    },
    async getPreUndo(userId, messageId) {
      const { data } = await supabase
        .from('outlook_glance_undo_snap')
        .select('was_marked')
        .eq('user_id', userId)
        .eq('message_id', messageId)
        .maybeSingle();
      return { wasMarked: Boolean(data?.was_marked) };
    },
    upsertAccount: (row) => supabase.from('outlook_graph_accounts').upsert(row),
    upsertSubscription: (row) => supabase.from('outlook_graph_subscriptions').upsert(row),
    listSubscriptions: async () => {
      const { data } = await supabase.from('outlook_graph_subscriptions').select('*');
      return data || [];
    },
    updateSubscriptionExpiration: (graphId, expiration) =>
      supabase.from('outlook_graph_subscriptions').update({ expiration, updated_at: new Date().toISOString() }).eq('graph_subscription_id', graphId),
    listAccountUserIds: async () => {
      const { data } = await supabase.from('outlook_graph_accounts').select('user_id');
      return (data || []).map((r) => r.user_id);
    },
    getDeltaLink: async (userId) => {
      const { data } = await supabase.from('outlook_graph_delta').select('delta_link').eq('user_id', userId).maybeSingle();
      return data?.delta_link || null;
    },
    setDeltaLink: async (userId, deltaLink) => {
      await supabase.from('outlook_graph_delta').upsert({ user_id: userId, delta_link: deltaLink, updated_at: new Date().toISOString() });
    }
  };
}
