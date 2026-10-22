import { hashClientState, constantTimeEqual } from './crypto.mjs';
import { validationEchoResponse } from './graph.mjs';
import { processMessageForMark } from './notify-handler-core.mjs';

export { processMessageForMark } from './notify-handler-core.mjs';

/**
 * @param {object} deps
 */
export async function handleGraphNotificationRequest(req, deps) {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get('validationToken');
  if (validationToken) {
    const echo = validationEchoResponse(validationToken);
    return new Response(echo.body, { status: echo.status, headers: { 'Content-Type': echo.contentType } });
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const values = payload?.value;
  if (!Array.isArray(values)) return new Response('Accepted', { status: 202 });

  for (const note of values) {
    const clientState = note?.clientState;
    const subRow = await deps.resolveUserFromNotification(note);
    if (!subRow?.user_id) continue;

    const expectedHash = subRow.client_state_hash
      ? subRow.client_state_hash instanceof Uint8Array
        ? subRow.client_state_hash
        : new Uint8Array(subRow.client_state_hash)
      : null;
    if (!expectedHash) continue;
    const gotHash = await hashClientState(clientState, deps.clientStatePepper);
    if (!constantTimeEqual(gotHash, expectedHash)) {
      return new Response('clientState mismatch', { status: 403 });
    }

    const messageId = note?.resourceData?.id;
    if (!messageId) continue;

    const userId = subRow.user_id;
    const auth = await deps.getAccessTokenForUser(userId);
    if (!auth?.accessToken) continue;

    const { getMessage } = await import('./graph.mjs');
    const msg = await getMessage(auth.accessToken, messageId);
    await processMessageForMark(deps, userId, messageId, auth.accessToken, msg);
  }

  return new Response('Accepted', { status: 202 });
}
