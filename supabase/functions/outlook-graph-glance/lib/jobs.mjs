import { renewSubscription, subscriptionsNeedingRenewal, runDelta } from './graph.mjs';
import { processMessageForMark } from './notify-handler-core.mjs';
import { getMessage } from './graph.mjs';

export async function renewExpiringSubscriptions(deps, nowMs) {
  const rows = await deps.listSubscriptions();
  const need = subscriptionsNeedingRenewal(rows, nowMs);
  const results = [];
  for (const row of need) {
    const auth = await deps.getAccessTokenForUser(row.user_id);
    if (!auth?.accessToken) {
      results.push({ user_id: row.user_id, ok: false, reason: 'no_token' });
      continue;
    }
    try {
      const updated = await renewSubscription(auth.accessToken, row.graph_subscription_id, nowMs);
      await deps.updateSubscriptionExpiration(row.graph_subscription_id, updated.expirationDateTime);
      results.push({ user_id: row.user_id, ok: true, expiration: updated.expirationDateTime });
    } catch (e) {
      results.push({ user_id: row.user_id, ok: false, reason: String(e.message || e) });
    }
  }
  return results;
}

export async function runDeltaCatchUp(deps, userId, nowMs) {
  const auth = await deps.getAccessTokenForUser(userId);
  if (!auth?.accessToken) return { user_id: userId, ok: false, reason: 'no_token' };
  const prior = await deps.getDeltaLink(userId);
  let link = prior;
  let allIds = [];
  let finalDelta = prior;
  for (let page = 0; page < 20; page++) {
    const { ids, deltaLink, nextLink } = await runDelta(auth.accessToken, link);
    allIds = allIds.concat(ids);
    if (deltaLink) {
      finalDelta = deltaLink;
      break;
    }
    link = nextLink;
    if (!link) break;
  }
  if (finalDelta && finalDelta !== prior) await deps.setDeltaLink(userId, finalDelta);
  const marked = [];
  for (const messageId of allIds) {
    try {
      const msg = await getMessage(auth.accessToken, messageId);
      const r = await processMessageForMark(deps, userId, messageId, auth.accessToken, msg);
      if (r.action === 'marked') marked.push(messageId);
    } catch {
      /* skip unreadable */
    }
  }
  return { user_id: userId, ok: true, scanned: allIds.length, marked: marked.length };
}

export async function runDeltaForAllUsers(deps, nowMs) {
  const users = await deps.listAccountUserIds();
  const out = [];
  for (const userId of users) {
    out.push(await runDeltaCatchUp(deps, userId, nowMs));
  }
  return out;
}
