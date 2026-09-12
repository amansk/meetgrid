const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Rejection sampling rather than a modulo: 256 is not a multiple of 62, so
 * `byte % 62` would make the first eight characters of the alphabet a quarter
 * more likely than the rest. That barely mattered across twelve characters; it
 * matters at four, where the id is the only thing guarding a poll.
 */
export function generateId(length = 12): string {
  const limit = Math.floor(256 / ID_ALPHABET.length) * ID_ALPHABET.length;
  let id = '';
  while (id.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length - id.length + 8));
    for (const byte of bytes) {
      if (byte >= limit) continue;
      id += ID_ALPHABET[byte % ID_ALPHABET.length];
      if (id.length === length) break;
    }
  }
  return id;
}

export function generateSecret(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function hashSecret(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  const computed = await hashSecret(secret);
  if (computed.length !== hash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return mismatch === 0;
}
