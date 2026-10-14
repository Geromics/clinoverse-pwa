import { describe, expect, it } from 'vitest';
import { buildKeysData } from './connect';
import { createIdentity, decryptAsymmetric, encryptAsymmetric, getKeyFromId, hex, makeKeyPair, randomBytes } from './crypto';
import { demoIdentity } from './demo';
import type { Provider, SessionInfo, StoredFile } from './api';

const providerKp = makeKeyPair(randomBytes(32));
const provider: Provider = {
  providerDid: 'did:clinoverse:P',
  providerName: 'P',
  providerType: 'institution',
  publicKey: providerKp.getPublic('hex'),
  accessTo: [{ label: 'genome', SNPs: ['rs1', 'rs2'], info: ['birth_date'] }],
};
const identity = createIdentity();
const file: StoredFile = { fileId: 'f', fileName: 'genome.txt' };
const info = (over: Partial<SessionInfo> = {}): SessionInfo => ({ providerDid: provider.providerDid, accessTo: provider.accessTo, ...over });
const base = { identity, demo: false, providers: [provider], files: [file] };
const open = (env: string) => decryptAsymmetric(env, providerKp) as Record<string, string>;
// A v2 file: random file key, wrapped to the owner's public key (as the uploader stores it).
const wrap = (fileKey: string, publicKey: string) => encryptAsymmetric({ file_key: fileKey }, publicKey, makeKeyPair(randomBytes(32)));
const fileKey = hex.fromBytes(randomBytes(32));
const v2 = { ...base, wrappedKeys: { f: wrap(fileKey, identity.publicKey) } };
const uploader = { label: 'upload', info: ['public_key'] };

describe('buildKeysData', () => {
  it('sends per-id keys (info, header, SNPs) derived from the unwrapped file key', () => {
    const keys = open(buildKeysData(info(), v2));
    expect(Object.keys(keys)).toEqual(['birth_date', 'header', 'rs1', 'rs2']);
    expect(keys.rs1).toBe(getKeyFromId(fileKey, 'rs1'));
    expect(Object.values(keys)).not.toContain(getKeyFromId(identity.privateKey, 'rs1'));
  });

  it('derives from the private key for a legacy file (no filekey record)', () => {
    const keys = open(buildKeysData(info(), base));
    expect(keys.rs1).toBe(getKeyFromId(identity.privateKey, 'rs1'));
  });

  it('unwraps a linked demo file with the demo identity', () => {
    const demo = demoIdentity();
    const demoKey = hex.fromBytes(randomBytes(32));
    const files = [{ fileId: 'd', fileName: '' }];
    const keys = open(buildKeysData(info(), { ...base, files, wrappedKeys: { d: wrap(demoKey, demo.publicKey) } }));
    expect(keys.header).toBe(getKeyFromId(demoKey, 'header'));
    expect(open(buildKeysData(info(), { ...base, files })).header).toBe(getKeyFromId(demo.privateKey, 'header')); // legacy demo file
  });

  it('refuses a file key wrapped to someone else', () => {
    const other = createIdentity();
    expect(() => buildKeysData(info(), { ...base, wrappedKeys: { f: wrap(fileKey, other.publicKey) } })).toThrow();
  });

  it('gives the uploader only the public key', () => {
    const keys = open(buildKeysData(info({ accessTo: [uploader] }), { ...base, files: [] }));
    expect(keys).toEqual({ public_key: identity.publicKey });
  });

  it('refuses a request for the private key', () => {
    expect(() => buildKeysData(info({ accessTo: [{ label: 'key', info: ['master_key'] }] }), base)).toThrow('private key');
    expect(() => buildKeysData(info({ accessTo: [{ label: 'k', SNPs: ['rs1'], info: ['master_key'] }] }), base)).toThrow('private key');
  });

  it('rejects what the old dialog rejected', () => {
    expect(() => buildKeysData(info({ accessTo: undefined }), base)).toThrow('Invalid request.');
    expect(() => buildKeysData(info({ accessTo: [{ label: 'x', SNPs: [''] }] }), base)).toThrow('Invalid request.');
    expect(() => buildKeysData(info(), { ...base, demo: true })).toThrow('not available for demo');
    expect(() => buildKeysData(info({ providerDid: 'did:clinoverse:X' }), base)).toThrow('Invalid or inactive');
    expect(() => buildKeysData(info(), { ...base, files: [] })).toThrow('No files to share');
    expect(() => buildKeysData(info({ providerPublicKey: 'abc' }), base)).toThrow('Invalid provider public key.');
  });

  it('sends self-declared values as _values, with no file keys when nothing else is asked', () => {
    const shop = info({ accessTo: [{ label: 'shoe size', info: ['shoe_size'] }] });
    const keys = open(buildKeysData(shop, { ...base, files: [], details: { shoe_size: ' 10 UK ', other: 'x' } }));
    expect(keys).toEqual({ _values: { shoe_size: '10 UK' } });
  });

  it('adds _values next to file keys for mixed requests', () => {
    const mixed = info({ accessTo: [{ label: 'genome', SNPs: ['rs1'] }, { label: 'shoe size', info: ['shoe_size'] }] });
    const keys = open(buildKeysData(mixed, { ...v2, details: { shoe_size: '42 EU' } }));
    expect(Object.keys(keys)).toEqual(['header', 'rs1', '_values']);
    expect(keys._values).toEqual({ shoe_size: '42 EU' });
    expect(keys.rs1).toBe(getKeyFromId(fileKey, 'rs1'));
  });

  it('refuses an inline item the user has not set', () => {
    const shop = info({ accessTo: [{ label: 'shoe size', info: ['shoe_size'] }] });
    expect(() => buildKeysData(shop, base)).toThrow('Add your shoe size under My details first.');
    expect(() => buildKeysData(shop, { ...base, details: { shoe_size: '  ' } })).toThrow('My details');
  });

  it('never adds _values to SNP or public_key requests', () => {
    const details = { shoe_size: '10 UK' };
    expect(open(buildKeysData(info(), { ...v2, details }))._values).toBeUndefined();
    const pk = open(buildKeysData(info({ accessTo: [uploader] }), { ...base, details }));
    expect(pk).toEqual({ public_key: identity.publicKey });
  });

  it('allows demo accounts on enabledInDemo providers', () => {
    expect(() => buildKeysData(info(), { ...base, demo: true, providers: [{ ...provider, enabledInDemo: true }] })).not.toThrow();
  });
});
