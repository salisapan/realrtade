import { hashClientState } from './crypto.mjs';
import { createInboxSubscription } from './graph.mjs';

export async function connectOutlookAccount(deps, { userId, refreshToken, tenantId, notificationUrl, clientState, nowMs }) {
  const enc = await deps.encryptRefreshToken(refreshToken);
  await deps.upsertAccount({
    user_id: userId,
    tenant_id: tenantId || null,
    refresh_token_enc: enc.refresh_token_enc,
    token_nonce: enc.token_nonce
  });

  const access = await deps.getAccessTokenForUser(userId);
  if (!access?.accessToken) throw new Error('no_access_after_connect');

  const sub = await createInboxSubscription(access.accessToken, notificationUrl, clientState, nowMs);
  const hash = await hashClientState(clientState, deps.clientStatePepper);
  await deps.upsertSubscription({
    user_id: userId,
    graph_subscription_id: sub.id,
    resource: sub.resource,
    change_type: sub.changeType,
    client_state_hash: hash,
    expiration: sub.expirationDateTime
  });
  return { subscriptionId: sub.id, expiration: sub.expirationDateTime };
}
