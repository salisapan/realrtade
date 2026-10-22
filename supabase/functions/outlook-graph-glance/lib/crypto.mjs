const subtle = globalThis.crypto.subtle;

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function keyBytesFromEnv(hexOrB64) {
  const raw = String(hexOrB64 || '').trim();
  if (!raw) throw new Error('OUTLOOK_TOKEN_ENCRYPTION_KEY missing');
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return hexToBytes(raw);
  const bytes = base64ToBytes(raw);
  if (bytes.length !== 32) throw new Error('OUTLOOK_TOKEN_ENCRYPTION_KEY must be 32 bytes (hex64 or base64)');
  return bytes;
}

export async function encryptRefreshToken(plaintext, keyMaterial) {
  const keyBytes = keyBytesFromEnv(keyMaterial);
  const key = await subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const enc = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, new TextEncoder().encode(String(plaintext)))
  );
  return { refresh_token_enc: enc, token_nonce: nonce };
}

export async function decryptRefreshToken(refresh_token_enc, token_nonce, keyMaterial) {
  const keyBytes = keyBytesFromEnv(keyMaterial);
  const key = await subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const enc =
    refresh_token_enc instanceof Uint8Array ? refresh_token_enc : new Uint8Array(refresh_token_enc);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: token_nonce }, key, enc);
  return new TextDecoder().decode(plain);
}

export async function hashClientState(clientState, pepper) {
  const data = new TextEncoder().encode(String(clientState || '') + '|' + String(pepper || ''));
  const digest = await subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

export function constantTimeEqual(a, b) {
  const x = a instanceof Uint8Array ? a : new Uint8Array(a);
  const y = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
