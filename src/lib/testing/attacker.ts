// Attacker model for the upload key design, shared by the property tests and the e2e test.
//
// A VIEW is every string a party (or a coalition) has. The attacker extracts every hex/base64 value
// from it, unwraps every asymmetric envelope (in the view or the stored file) with every
// private-key-shaped value it has, to a fixed point, then tries every value as an AES key directly
// and through the system's own derivation PBKDF2(value, id) for every id in the stored file.
// Not shipped: only tests import it.
import aes from 'aes-js';
import elliptic from 'elliptic';
import { FILEKEY_ID, decryptAsymmetric, getKeyFromId, hex, randomBytes, signMessage, verifyMessage } from '../crypto';

const ec = new elliptic.ec('secp256k1');
const HEX = /[0-9a-f]{32,}/gi;
const B64 = /[A-Za-z0-9+/]{22,}={0,2}/g;
const ENVELOPE = /(04[0-9a-f]{128}) ([0-9a-f]+) ([0-9a-f]{32})/gi;

export const b64 = {
  fromHex: (h: string) => Buffer.from(h, 'hex').toString('base64'),
  toHex: (b: string) => Buffer.from(b, 'base64').toString('hex'),
};
// Store format: `id \t base64(ct) \t base64(iv)` per line (upload's records.mjs).
export const rows = (tsv: string) => tsv.split('\n').filter(Boolean).map((l) => l.split('\t'));

// Decrypts and insists on the exact padding (spaces, then the text length in hex), so a wrong key
// almost never passes as a short plaintext such as a bare '#' comment line.
export function aesDecrypt(ctHex: string, ivHex: string, keyHex: string): string {
  const p = new TextDecoder().decode(new aes.ModeOfOperation.cbc(hex.toBytes(keyHex), hex.toBytes(ivHex)).decrypt(hex.toBytes(ctHex)));
  const text = p.substring(0, parseInt(p.substring(p.lastIndexOf(' ')), 16));
  const sizeHex = text.length.toString(16);
  if (p !== text.padEnd(p.length - sizeHex.length, ' ') + sizeHex) throw new Error('bad padding');
  return text;
}

function tokensOf(s: string, into: Set<string>) {
  for (const t of s.match(HEX) ?? []) into.add(t.toLowerCase());
  for (const t of s.match(B64) ?? []) {
    const h = b64.toHex(t);
    if (h.length >= 32) into.add(h);
  }
}
const isPriv = (t: string) => t.length >= 60 && t.length <= 64;

/** Every value in the view, plus everything that unwraps from envelopes, to a fixed point. */
export function closure(view: string[], stored: string): Set<string> {
  const tokens = new Set<string>();
  const texts = [...view];
  const envelopes = [...view, stored].flatMap((s) => [...s.matchAll(ENVELOPE)].map((m) => m[0]));
  const tried = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const t of texts.splice(0)) tokensOf(t, tokens);
    for (const p of [...tokens].filter(isPriv)) {
      for (const env of envelopes) {
        if (tried.has(p + env)) continue;
        tried.add(p + env);
        try {
          texts.push(JSON.stringify(decryptAsymmetric(env, ec.keyFromPrivate(p, 'hex'))));
          grew = true;
        } catch { /* not this key */ }
      }
    }
  }
  return tokens;
}

/** Ids of the stored records whose true plaintext (per `isPlaintext`) the view recovers. */
export function recordsDecryptableBy(view: string[], stored: string, isPlaintext: (id: string, text: string) => boolean): Set<string> {
  const tokens = closure(view, stored);
  const records = rows(stored).filter(([id]) => id !== FILEKEY_ID);
  const keys = new Set([...tokens].filter((t) => [32, 48, 64].includes(t.length)));
  for (const t of tokens) for (const [id] of records) keys.add(getKeyFromId(t, id));
  const readable = new Set<string>();
  for (const [id, ct, iv] of records) {
    for (const k of keys) {
      try {
        if (isPlaintext(id, aesDecrypt(b64.toHex(ct), b64.toHex(iv), k))) { readable.add(id); break; }
      } catch { /* wrong key size or garbage */ }
    }
  }
  return readable;
}

/** Does any private-key-shaped value the view has sign a clino login that verifies as the user? */
export function signsLoginFor(view: string[], stored: string, userPublicKey: string): boolean {
  const nonce = randomBytes(32);
  return [...closure(view, stored)].filter(isPriv).some((p) => {
    try {
      const { message, signedMessage } = signMessage(ec.keyFromPrivate(p, 'hex'), nonce);
      return verifyMessage(userPublicKey, message, signedMessage);
    } catch {
      return false;
    }
  });
}
