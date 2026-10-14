// Port of clinoverse-mobile app/utils/{cryptoUtils,mnemonicUtils,UserIdentity,DemoFileKeygen}.js.
// Wire-compatible with clino; no React, no DOM, runs under Node.
import elliptic from 'elliptic';
import { keccak256 } from 'js-sha3';
import aes from 'aes-js';
import bs58 from 'bs58';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export type KeyPair = elliptic.ec.KeyPair;

const ec = new elliptic.ec('secp256k1');
const utf8 = { encode: (s: string) => new TextEncoder().encode(s), decode: (b: Uint8Array) => new TextDecoder().decode(b) };
// Same semantics as aes-js utils.hex, but Uint8Array out; an odd trailing nibble is kept as its own byte
// (the ECDH secret is un-padded hex, so this matters for wire compatibility).
export const hex = {
  toBytes: (h: string) => Uint8Array.from(h.match(/.{1,2}/g) ?? [], (b) => parseInt(b, 16)),
  fromBytes: (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''),
};
export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function makeKeyPair(seed: Uint8Array | number[]): KeyPair {
  return ec.keyFromPrivate(keccak256(seed), 'hex');
}

// Custom padding: spaces to the block boundary, then the text length in hex as a suffix.
function textToPBytes(text: string, blockSize: number): Uint8Array {
  const sizeHex = text.length.toString(16);
  const padded = Math.ceil((text.length + sizeHex.length + 1) / blockSize) * blockSize;
  return utf8.encode(text.padEnd(padded - sizeHex.length, ' ') + sizeHex);
}

function pBytesToText(bytes: Uint8Array): string {
  const pText = utf8.decode(bytes);
  const size = parseInt(pText.substring(pText.lastIndexOf(' ')), 16);
  return pText.substring(0, size);
}

// PBKDF2-SHA256, 1 iteration, 16 bytes, salt = id padded/cut to 16 chars.
export function getKeyFromId(userKeyHex: string, id: string): string {
  const salt = id.padEnd(16, ' ').substring(0, 16);
  return hex.fromBytes(pbkdf2(sha256, hex.toBytes(userKeyHex), salt, { c: 1, dkLen: 16 }));
}

export function signMessage(keyPair: KeyPair, message: Uint8Array) {
  const signedMessage = keyPair.sign(keccak256(message)).toDER('hex');
  return { message: hex.fromBytes(message), signedMessage };
}

export function verifyMessage(publicKeyHex: string, messageHex: string, signedMessageHex: string): boolean {
  const messageHash = keccak256(hex.toBytes(messageHex));
  return ec.keyFromPublic(publicKeyHex, 'hex').verify(messageHash, hex.toBytes(signedMessageHex));
}

// ECDH shared secret as un-padded hex (protocol quirk; do not pad).
function getSecretKey(keyPair: KeyPair, remotePubKeyHex: string): string {
  return keyPair.derive(ec.keyFromPublic(remotePubKeyHex, 'hex').getPublic()).toString('hex');
}

function encrypt(pt: string, keyHex: string) {
  const iv = randomBytes(16);
  const ct = new aes.ModeOfOperation.cbc(hex.toBytes(keyHex), iv).encrypt(textToPBytes(pt, 16));
  return { ct: hex.fromBytes(ct), iv: hex.fromBytes(iv) };
}

function decrypt(ctHex: string, ivHex: string, keyHex: string): string {
  const pt = new aes.ModeOfOperation.cbc(hex.toBytes(keyHex), hex.toBytes(ivHex)).decrypt(hex.toBytes(ctHex));
  return pBytesToText(pt).trimEnd();
}

// Envelope: "<senderPubHex> <ctHex> <ivHex>"
export function encryptAsymmetric(json: unknown, remotePubKeyHex: string, keyPair: KeyPair): string {
  const { ct, iv } = encrypt(JSON.stringify(json), getSecretKey(keyPair, remotePubKeyHex));
  return [keyPair.getPublic('hex'), ct, iv].join(' ');
}

export function decryptAsymmetric(encrypted: string, keyPair: KeyPair): unknown {
  const [remotePubKeyHex, ct, iv] = encrypted.split(' ');
  return JSON.parse(decrypt(ct, iv, getSecretKey(keyPair, remotePubKeyHex)));
}

export function encryptRecord(data: unknown, id: string, privateKeyHex: string) {
  const key = getKeyFromId(privateKeyHex, id);
  return { ...encrypt(JSON.stringify(data), key), key };
}

export function decryptRecord(ctHex: string, ivHex: string, keyHex: string): unknown {
  return JSON.parse(decrypt(ctHex, ivHex, keyHex));
}

// Mnemonics (BIP39 english, empty passphrase)
export const normalizeMnemonic = (m: string) => m.trim().toLowerCase().split(/\s+/).join(' ');
export const randomMnemonic = () => generateMnemonic(wordlist, 128);
export const isValidMnemonic = (m: string) => validateMnemonic(m, wordlist);
export const isValidWord = (w: string) => wordlist.includes(w);
export const mnemonicToSeed = (m: string) => mnemonicToSeedSync(m, '');

// Identity
export interface Identity {
  did: string;
  mnemonic: string;
  publicKey: string;
  privateKey: string;
  keyPair: KeyPair;
}

export const didFromKeyPair = (kp: KeyPair) =>
  'did:clinoverse:' + bs58.encode(Uint8Array.from(kp.getPublic('array')));

export function identityFromMnemonic(raw: string): Identity {
  const mnemonic = normalizeMnemonic(raw);
  if (!isValidMnemonic(mnemonic)) throw new Error('Invalid mnemonic.');
  const keyPair = makeKeyPair(mnemonicToSeed(mnemonic));
  return {
    did: didFromKeyPair(keyPair),
    mnemonic,
    publicKey: keyPair.getPublic('hex'),
    privateKey: keyPair.getPrivate('hex'),
    keyPair,
  };
}

export const createIdentity = () => identityFromMnemonic(randomMnemonic());

export function authParameters(identity: Identity) {
  return { userDid: identity.did, ...signMessage(identity.keyPair, randomBytes(16)) };
}

// Per-id record keys derived from a private key (user's own, or the demo account's).
export const fileKeygen = (privateKeyHex: string) => (id: string) => getKeyFromId(privateKeyHex, id);
