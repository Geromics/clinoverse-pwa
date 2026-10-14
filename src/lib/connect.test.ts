import { describe, expect, it } from 'vitest';
import { buildKeysData } from './connect';
import { createIdentity, decryptAsymmetric, getKeyFromId, makeKeyPair, randomBytes } from './crypto';
import { demoFileKeygen } from './demo';
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

describe('buildKeysData', () => {
  it('sends per-id keys (info, header, SNPs) to the provider', () => {
    const keys = open(buildKeysData(info(), base));
    expect(Object.keys(keys)).toEqual(['birth_date', 'header', 'rs1', 'rs2']);
    expect(keys.rs1).toBe(getKeyFromId(identity.privateKey, 'rs1'));
  });

  it('uses demo keys for a linked demo file', () => {
    const keys = open(buildKeysData(info(), { ...base, files: [{ fileId: 'd', fileName: '' }] }));
    expect(keys.header).toBe(demoFileKeygen()('header'));
  });

  it('sends only the master key when that is the sole info item', () => {
    const keys = open(buildKeysData(info({ accessTo: [{ label: 'key', info: ['master_key'] }] }), base));
    expect(keys).toEqual({ master_key: identity.privateKey });
  });

  it('rejects what the old dialog rejected', () => {
    expect(() => buildKeysData(info({ accessTo: undefined }), base)).toThrow('Invalid request.');
    expect(() => buildKeysData(info({ accessTo: [{ label: 'x', SNPs: [''] }] }), base)).toThrow('Invalid request.');
    expect(() => buildKeysData(info(), { ...base, demo: true })).toThrow('not available for demo');
    expect(() => buildKeysData(info({ providerDid: 'did:clinoverse:X' }), base)).toThrow('Invalid or inactive');
    expect(() => buildKeysData(info(), { ...base, files: [] })).toThrow('No files to share');
    expect(() => buildKeysData(info({ providerPublicKey: 'abc' }), base)).toThrow('Invalid provider public key.');
  });

  it('allows demo accounts on enabledInDemo providers', () => {
    expect(() => buildKeysData(info(), { ...base, demo: true, providers: [{ ...provider, enabledInDemo: true }] })).not.toThrow();
  });
});
