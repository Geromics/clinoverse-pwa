// Mnemonic at rest: PBKDF2-SHA256 (PIN, random salt) -> AES-GCM (random iv). WebCrypto only.
export interface Vault { salt: string; iv: string; ct: string; }

const ITERATIONS = 150_000;
const b64 = {
  encode: (b: Uint8Array) => btoa(String.fromCharCode(...b)),
  decode: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

async function pinKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(mnemonic: string, pin: string): Promise<Vault> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await pinKey(pin, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(mnemonic));
  return { salt: b64.encode(salt), iv: b64.encode(iv), ct: b64.encode(new Uint8Array(ct)) };
}

// Throws on a wrong PIN (AES-GCM authentication failure).
export async function open(vault: Vault, pin: string): Promise<string> {
  const key = await pinKey(pin, b64.decode(vault.salt));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.decode(vault.iv) }, key, b64.decode(vault.ct));
  return new TextDecoder().decode(pt);
}
