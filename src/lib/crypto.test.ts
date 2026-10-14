import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { pbkdf2Sync } from 'node:crypto';
import vm from 'node:vm';
import elliptic from 'elliptic';
import aes from 'aes-js';
import {
  authParameters, createIdentity, decryptAsymmetric, encryptAsymmetric, encryptRecord, decryptRecord,
  fileKeygen, getKeyFromId, identityFromMnemonic, verifyMessage,
} from './crypto';
import { demoMnemonic } from './demo';

const ec = new elliptic.ec('secp256k1');
// Sibling repos on the dev machine; the tests that need them are skipped elsewhere (CI).
const ROOT = process.env.GEROMICS_ROOT || '/home/dan/Build/Geromics';
const CLINO_CRYPTO = `${ROOT}/docker-compose-clinoverse/sources/clino/utils/crypto-utils.js`;
const SECRETS = `${ROOT}/secrets/secrets.json`;

interface ClinoCrypto {
  verifyMessage(publicKey: string, message: string, signedMessage: string): boolean;
  signMessage(privateKey: string, message: Buffer): { message: string; signedMessage: string };
}

// clino's pure-node crypto-utils.js, evaluated with this repo's node_modules (clino's are not installed).
function loadClinoCryptoUtils(): ClinoCrypto {
  const module = { exports: {} as ClinoCrypto };
  const fn = vm.runInThisContext(`(function (require, module, exports) {${readFileSync(CLINO_CRYPTO, 'utf8')}\n})`, { filename: CLINO_CRYPTO });
  fn(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}

// Reference decrypt using elliptic + aes-js directly (same padding scheme as the old app).
function referenceDecrypt(envelope: string, privHex: string) {
  const [senderPub, ctHex, ivHex] = envelope.split(' ');
  const secret = ec.keyFromPrivate(privHex, 'hex').derive(ec.keyFromPublic(senderPub, 'hex').getPublic()).toString('hex');
  const bytes = new aes.ModeOfOperation.cbc(aes.utils.hex.toBytes(secret), aes.utils.hex.toBytes(ivHex)).decrypt(aes.utils.hex.toBytes(ctHex));
  const padded = Buffer.from(bytes).toString('utf8');
  const size = parseInt(padded.substring(padded.lastIndexOf(' ')), 16);
  return JSON.parse(padded.substring(0, size).trimEnd());
}

describe('signatures', () => {
  it.skipIf(!existsSync(CLINO_CRYPTO))('auth parameters verify with clino verifyMessage', () => {
    const clino = loadClinoCryptoUtils();
    const id = createIdentity();
    const { userDid, message, signedMessage } = authParameters(id);
    expect(userDid).toBe(id.did);
    expect(message).toMatch(/^[0-9a-f]{32}$/);
    expect(clino.verifyMessage(id.publicKey, message, signedMessage)).toBe(true);
    expect(clino.verifyMessage(id.publicKey, message.replace(/^../, '00'), signedMessage)).toBe(false);
    expect(verifyMessage(id.publicKey, message, signedMessage)).toBe(true);
  });

  it.skipIf(!existsSync(CLINO_CRYPTO))('verifies clino-produced signatures', () => {
    const clino = loadClinoCryptoUtils();
    const id = createIdentity();
    const { message, signedMessage } = clino.signMessage(id.privateKey, Buffer.from('hello'));
    expect(verifyMessage(id.publicKey, message, signedMessage)).toBe(true);
  });
});

describe('asymmetric envelope', () => {
  const localPriv = '1731446e2bc815ba9b6ddb4b6c67b587531441c1aba111cac75a12eca80868bb';
  const remotePriv = 'aa2ea1267905310af0ef73d1e15c4cfe33af2949b9824bf2f78ac8cc1cf04f8f';
  const remotePub = '0464ef9af05e8903ff9fd6a7679346e9ea5e38059fc2360a72175dc945db0d1874d8538e74c6e398b41b667b75a7dff9e691c99463c51822bad7df9541f2626f5b';

  it('is decrypted by a reference elliptic/aes-js implementation', () => {
    const keys = { header: 'ab'.repeat(16), rs123: 'cd'.repeat(16), birth_date: 'ef'.repeat(16) };
    const envelope = encryptAsymmetric(keys, remotePub, ec.keyFromPrivate(localPriv, 'hex'));
    const [pub, ct, iv] = envelope.split(' ');
    expect(pub).toBe(ec.keyFromPrivate(localPriv, 'hex').getPublic('hex'));
    expect(iv).toMatch(/^[0-9a-f]{32}$/);
    expect(ct.length % 32).toBe(0);
    expect(referenceDecrypt(envelope, remotePriv)).toEqual(keys);
  });

  it('round-trips with decryptAsymmetric (old spec vector)', () => {
    const json = { a: '1', b: '2' };
    const env = encryptAsymmetric(json, remotePub, ec.keyFromPrivate(localPriv, 'hex'));
    expect(decryptAsymmetric(env, ec.keyFromPrivate(remotePriv, 'hex'))).toEqual(json);
  });

  it('record encryption round-trips', () => {
    const id = createIdentity();
    const { ct, iv, key } = encryptRecord({ x: 1 }, 'rs999', id.privateKey);
    expect(key).toBe(getKeyFromId(id.privateKey, 'rs999'));
    expect(decryptRecord(ct, iv, key)).toEqual({ x: 1 });
  });
});

describe('getKeyFromId', () => {
  it('matches Node pbkdf2Sync (sha256, 1 iteration, 16 bytes, salt padded to 16)', () => {
    const priv = '0f'.repeat(32);
    for (const id of ['header', 'rs12329760', 'birth_date', 'a-very-long-identifier-over-16']) {
      const salt = id.padEnd(16, ' ').substring(0, 16);
      const expected = pbkdf2Sync(Buffer.from(priv, 'hex'), salt, 1, 16, 'sha256').toString('hex');
      expect(getKeyFromId(priv, id)).toBe(expected);
      expect(fileKeygen(priv)(id)).toBe(expected);
    }
  });
});

describe('identity', () => {
  const demoDid = 'did:clinoverse:N4hr5VJk8Kxf2pW8izyhs8ucohuWVyrY6BYwpSFkRyBNRYTUwrGVD9NfvdM8XkmxL6UY63wp4DYELfV2NVegcLWL';

  it('derives the demo DID from the demo mnemonic', () => {
    expect(identityFromMnemonic(demoMnemonic).did).toBe(demoDid);
  });

  it.skipIf(!existsSync(SECRETS))('matches the demo account in secrets.json', () => {
    const secrets = JSON.parse(readFileSync(SECRETS, 'utf8'));
    expect(demoMnemonic).toBe(secrets.demo.mnemonic);
    const id = identityFromMnemonic(secrets.demo.mnemonic);
    expect(id.did).toBe(secrets.demo.did);
    expect(id.privateKey).toBe(secrets.demo.privateKey);
    expect(id.publicKey).toBe(secrets.demo.publicKey);
  });

  it('normalises case and whitespace, rejects bad mnemonics', () => {
    const id = identityFromMnemonic('  ' + demoMnemonic.toUpperCase().replace(/ /g, '   '));
    expect(id.mnemonic).toBe(demoMnemonic);
    expect(() => identityFromMnemonic('rural list erase clarify human repeat keep rhythm embark hollow merry merry')).toThrow();
    expect(createIdentity().mnemonic.split(' ')).toHaveLength(12);
  });
});
