import { getMessage, patchForMark, patchForUnmark, patchMessage } from './graph.mjs';

/**
 * Close: remove Glance category + clear flag; record dismissed so we never re-mark.
 * Undo: restore Glance category + flag if we had marked before close.
 * Not-this: same as close (dismiss).
 */
export async function closeMessage(deps, userId, messageId) {
  const auth = await deps.getAccessTokenForUser(userId);
  if (!auth?.accessToken) throw new Error('no_token');
  const msg = await getMessage(auth.accessToken, messageId);
  const priorMarked = await deps.isAlreadyMarked(userId, messageId);
  await deps.rememberPreUndo(userId, messageId, priorMarked, msg.categories);
  const patch = patchForUnmark(msg.categories);
  await patchMessage(auth.accessToken, messageId, patch);
  await deps.clearMarked(userId, messageId);
  await deps.recordDismissed(userId, messageId);
  return { ok: true };
}

export async function undoClose(deps, userId, messageId) {
  const auth = await deps.getAccessTokenForUser(userId);
  if (!auth?.accessToken) throw new Error('no_token');
  const snap = await deps.getPreUndo(userId, messageId);
  await deps.clearDismissed(userId, messageId);
  if (!snap?.wasMarked) {
    return { ok: true, restored: false };
  }
  const msg = await getMessage(auth.accessToken, messageId);
  const patch = patchForMark(msg.categories);
  await patchMessage(auth.accessToken, messageId, patch);
  await deps.recordMarked(userId, messageId);
  return { ok: true, restored: true };
}

export async function notThis(deps, userId, messageId) {
  return closeMessage(deps, userId, messageId);
}
