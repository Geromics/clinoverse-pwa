// Property tests for the upload key design (v2: per-file key wrapped to the user's public key).
//
// Each party's VIEW is everything it receives or computes. An attacker model tries every key in a
// view, and every key derivable from it with the system's own functions, against a stored file.
// The suite runs against a `legacyScheme` fixture (the uploader got the user's private key as
// `master_key`) to prove it has teeth: legacy must FAIL properties 1-3, v2 must pass them all.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { existsSync } from 'node:fs';
import aes from 'aes-js';
import { buildKeysData } from './connect';
import {
  FILEKEY_ID, decryptAsymmetric, didFromKeyPair, encryptAsymmetric, getKeyFromId, hex, makeKeyPair, randomBytes,
  unwrapFileKey, type Identity, type KeyPair,
} from './crypto';
import type { AccessTo, Provider, SessionInfo } from './api';
import { b64, recordsDecryptableBy as decryptable, rows, signsLoginFor as signs } from './testing/attacker';

const RUNS = 25;
const ROOT = process.env.GEROMICS_ROOT || '/home/dan/Build/Geromics';
const UPLOAD_CLI = `${ROOT}/docker-compose-clinoverse/sources/upload/scripts/encrypt-genome.mjs`;

// ------------------------------------------------------------------ world
const identityFrom = (seed: Uint8Array): Identity => {
  const keyPair = makeKeyPair(seed);
  return { did: didFromKeyPair(keyPair), mnemonic: '', publicKey: keyPair.getPublic('hex'), privateKey: keyPair.getPrivate('hex'), keyPair };
};

interface Genome { raw: string; birthDate: string; snps: string[]; truth: Map<string, string>; }
interface World {
  user: Identity;
  uploaderKp: KeyPair; // the File Uploader's registered provider key
  sessionKp: KeyPair; // its per-session key (the grant is encrypted to it)
  siteKp: KeyPair; // a query site (institution) key
  uploader: Provider;
  site: Provider;
  genome: Genome;
  accessTo: AccessTo[]; // what the query site asks for
  granted: Set<string>; // ids the user grants it (header always)
}

const HEADER = 'rsid\tchromosome\tposition\tgenotype';
const genome = (snps: string[], gts: string[], days: number): Genome => {
  const birthDate = new Date(days * 86400000).toISOString().slice(0, 10);
  const lines = snps.map((id, i) => `${id}\t1\t${1000 + i}\t${gts[i]}`);
  const truth = new Map<string, string>([
    ['#', `# ${HEADER}`], ['header', HEADER], ['birth_date', String(Date.parse(birthDate))],
    ...lines.map((l, i) => [snps[i], l] as [string, string]),
  ]);
  return { raw: [`# ${HEADER}`, ...lines].join('\n') + '\n', birthDate, snps, truth };
};

const seed = fc.uint8Array({ minLength: 32, maxLength: 32 });
const arbWorld: fc.Arbitrary<World> = fc
  .record({
    user: seed, uploader: seed, session: seed, site: seed,
    nums: fc.uniqueArray(fc.integer({ min: 1, max: 99_999_999 }), { minLength: 2, maxLength: 6 }),
    days: fc.integer({ min: 0, max: 20_000 }),
  })
  .chain((s) => {
    const snps = s.nums.map((n) => `rs${n}`);
    return fc.record({
      s: fc.constant(s),
      gts: fc.array(fc.constantFrom('AA', 'AG', 'CT', 'GG', 'TT'), { minLength: snps.length, maxLength: snps.length }),
      ask: fc.subarray(snps, { minLength: 1 }),
      birth: fc.boolean(),
    });
  })
  .map(({ s, gts, ask, birth }) => {
    const [uploaderKp, sessionKp, siteKp] = [s.uploader, s.session, s.site].map(makeKeyPair);
    const accessTo: AccessTo[] = [{ label: 'genome', SNPs: ask, ...(birth ? { info: ['birth_date'] } : {}) }];
    return {
      user: identityFrom(s.user), uploaderKp, sessionKp, siteKp,
      uploader: { providerDid: 'did:clinoverse:U', providerName: 'File Uploader', providerType: 'application', publicKey: uploaderKp.getPublic('hex'), accessTo: [{ label: 'upload', info: ['public_key'] }] },
      site: { providerDid: 'did:clinoverse:S', providerName: 'Site', providerType: 'institution', publicKey: siteKp.getPublic('hex'), accessTo },
      genome: genome(s.nums.map((n) => `rs${n}`), gts, s.days),
      accessTo,
      granted: new Set(['header', ...ask, ...(birth ? ['birth_date'] : [])]),
    };
  });

// ------------------------------------------------------------------ store format (mirror of upload's records.mjs)
function aesEncrypt(text: string, keyHex: string) {
  const sizeHex = text.length.toString(16);
  const padded = Math.ceil((text.length + sizeHex.length + 1) / 16) * 16;
  const iv = randomBytes(16);
  const ct = new aes.ModeOfOperation.cbc(hex.toBytes(keyHex), iv).encrypt(new TextEncoder().encode(text.padEnd(padded - sizeHex.length, ' ') + sizeHex));
  return [hex.fromBytes(ct), hex.fromBytes(iv)];
}
const recordsTsv = (g: Genome, rootHex: string) =>
  [...g.truth].map(([id, text]) => {
    const [ct, iv] = aesEncrypt(text, getKeyFromId(rootHex, id));
    return `${id}\t${b64.fromHex(ct)}\t${b64.fromHex(iv)}\n`;
  }).join('');
// What POST /file/key hands the owner: the `filekey` record's envelope (none for legacy files).
const filekeyOf = (tsv: string) => rows(tsv).find(([id]) => id === FILEKEY_ID)?.[1];
// What /data/getsnps returns to a provider: its granted rows, never `filekey`.
const fetched = (tsv: string, ids: Set<string>) => rows(tsv).filter(([id]) => id !== FILEKEY_ID && ids.has(id)).map((r) => r.join('\t')).join('\n');

// ------------------------------------------------------------------ schemes
interface Upload { tsv: string; transient: string[]; } // transient: values the uploader held while working
interface Scheme {
  name: string;
  uploaderGrant(w: World): Record<string, unknown>; // what the uploader decrypts from the user's grant
  upload(grant: Record<string, unknown>, g: Genome): Promise<Upload>;
  root(w: World, tsv: string): string; // test oracle: the secret all record keys of this file derive from
}

// The phone's real code (connect.ts) builds the query site's grant for both schemes.
function siteGrant(w: World, tsv: string): Record<string, string> {
  const wrapped = filekeyOf(tsv);
  const info: SessionInfo = { providerDid: w.site.providerDid, accessTo: w.accessTo };
  const env = buildKeysData(info, { identity: w.user, demo: false, providers: [w.site], files: [{ fileId: 'f', fileName: 'genome.txt' }], wrappedKeys: wrapped ? { f: wrapped } : {} });
  return decryptAsymmetric(env, w.siteKp) as Record<string, string>;
}

const legacyScheme: Scheme = {
  name: 'legacy (master_key)',
  uploaderGrant: (w) => ({ master_key: w.user.privateKey }), // today's grant, as a fixture
  upload: async (grant, g) => ({ tsv: recordsTsv(g, grant.master_key as string), transient: [] }),
  root: (w) => w.user.privateKey,
};

// v2 uploader grant: the phone's real code, decrypted with the uploader's session key.
function v2Grant(w: World) {
  const info: SessionInfo = { providerDid: w.uploader.providerDid, providerPublicKey: w.sessionKp.getPublic('hex'), accessTo: w.uploader.accessTo };
  return decryptAsymmetric(buildKeysData(info, { identity: w.user, demo: false, providers: [w.uploader], files: [] }), w.sessionKp) as Record<string, unknown>;
}
const v2Root = (w: World, tsv: string) => unwrapFileKey(filekeyOf(tsv)!, w.user.keyPair);

// v2 uploader model (same steps as upload's records.mjs), so this suite runs without the sibling repo.
const v2Scheme: Scheme = {
  name: 'v2 (model uploader)',
  uploaderGrant: v2Grant,
  upload: async (grant, g) => {
    const fileKey = hex.fromBytes(randomBytes(32));
    const ephemeral = makeKeyPair(randomBytes(32));
    const wrapped = encryptAsymmetric({ file_key: fileKey }, grant.public_key as string, ephemeral);
    return { tsv: `${FILEKEY_ID}\t${wrapped}\t-\n` + recordsTsv(g, fileKey), transient: [fileKey, ephemeral.getPrivate('hex')] };
  },
  root: v2Root,
};

// v2 with the real uploader CLI code (upload's scripts/encrypt-genome.mjs), when the sibling repo is here.
type EncryptGenome = (o: { pubkey: string; birthDate: string; input: Iterable<Uint8Array> }) => Promise<string>;
const realEncrypt: EncryptGenome | null = existsSync(UPLOAD_CLI) ? (await import(/* @vite-ignore */ UPLOAD_CLI)).encryptGenome : null;
const v2RealScheme: Scheme | null = realEncrypt && {
  name: 'v2 (real upload CLI)',
  uploaderGrant: v2Grant,
  upload: async (grant, g) => ({
    tsv: await realEncrypt({ pubkey: grant.public_key as string, birthDate: g.birthDate, input: [new TextEncoder().encode(g.raw)] }),
    transient: [], // the CLI never exposes the file key
  }),
  root: v2Root,
};

// ------------------------------------------------------------------ attacker (./testing/attacker.ts)
const recordsDecryptableBy = (view: string[], stored: string, truth: Map<string, string>) =>
  decryptable(view, stored, (id, text) => truth.get(id) === text);
const signsLoginFor = (view: string[], stored: string, user: Identity) => signs(view, stored, user.publicKey);

const encodings = (h: string) => [h.toLowerCase(), h.toUpperCase(), Buffer.from(h, 'hex').toString('base64')];
const sorted = (s: Set<string>) => [...s].sort();

// ------------------------------------------------------------------ properties
const properties: Record<string, (s: Scheme) => fc.IAsyncProperty<[World]>> = {
  // 1. The uploader's view (grant, what it computed, its output) holds neither the user's identity
  //    private key nor the root of any other file of that user.
  '1 absence': (s) => fc.asyncProperty(arbWorld, async (w) => {
    const grant = s.uploaderGrant(w);
    const up = await s.upload(grant, w.genome);
    const other = await s.upload(s.uploaderGrant(w), w.genome); // a separate upload of the same user
    const view = [JSON.stringify(grant), ...up.transient, up.tsv];
    for (const secret of [w.user.privateKey.padStart(64, '0'), s.root(w, other.tsv)]) {
      for (const enc of encodings(secret)) expect(view.some((v) => v.includes(enc)), `view contains ${enc.slice(0, 12)}...`).toBe(false);
    }
  }),

  // 2. Uploader (retained view) + query site collude: they read exactly the granted ids, and
  //    cannot log in as the user.
  '2 collusion': (s) => fc.asyncProperty(arbWorld, async (w) => {
    const grant = s.uploaderGrant(w);
    const { tsv } = await s.upload(grant, w.genome);
    const keys = siteGrant(w, tsv);
    const view = [JSON.stringify(grant), tsv, JSON.stringify(keys), fetched(tsv, w.granted)];
    expect(sorted(recordsDecryptableBy(view, tsv, w.genome.truth))).toEqual(sorted(w.granted));
    expect(signsLoginFor(view, tsv, w.user)).toBe(false);
  }),

  // 3. Re-upload revokes: keys granted for file 1 read nothing in file 2 (same genome).
  '3 revocation': (s) => fc.asyncProperty(arbWorld, async (w) => {
    const f1 = await s.upload(s.uploaderGrant(w), w.genome);
    const f2 = await s.upload(s.uploaderGrant(w), w.genome);
    const keys1 = siteGrant(w, f1.tsv);
    expect(sorted(recordsDecryptableBy([JSON.stringify(keys1)], f1.tsv, w.genome.truth))).toEqual(sorted(w.granted));
    expect(sorted(recordsDecryptableBy([JSON.stringify(keys1)], f2.tsv, w.genome.truth))).toEqual([]);
  }),

  // 4. Only the user can unwrap the file key.
  '4 only the user unwraps': (s) => fc.asyncProperty(arbWorld, async (w) => {
    const { tsv } = await s.upload(s.uploaderGrant(w), w.genome);
    const wrapped = filekeyOf(tsv);
    expect(wrapped).toBeDefined();
    for (const kp of [w.uploaderKp, w.sessionKp, w.siteKp]) {
      expect(() => unwrapFileKey(wrapped!, kp)).toThrow();
      expect(sorted(recordsDecryptableBy([kp.getPrivate('hex')], tsv, w.genome.truth))).toEqual([]);
    }
    expect(unwrapFileKey(wrapped!, w.user.keyPair)).toMatch(/^[0-9a-f]{64}$/);
  }),

  // 5. Positive control: the user's own key reads every record (the harness detects access).
  '5 user reads all': (s) => fc.asyncProperty(arbWorld, async (w) => {
    const { tsv } = await s.upload(s.uploaderGrant(w), w.genome);
    expect(sorted(recordsDecryptableBy([w.user.privateKey], tsv, w.genome.truth))).toEqual(sorted(new Set(w.genome.truth.keys())));
  }),
};

const v2Schemes = [v2Scheme, ...(v2RealScheme ? [v2RealScheme] : [])];
for (const scheme of v2Schemes) {
  describe(scheme.name, () => {
    for (const [name, prop] of Object.entries(properties)) {
      it(`property ${name}`, async () => { await fc.assert(prop(scheme), { numRuns: RUNS }); }, 60_000);
    }
  });
}

describe('legacy scheme (meta: the properties have teeth)', () => {
  for (const name of ['1 absence', '2 collusion', '3 revocation']) {
    it(`fails property ${name}`, async () => {
      const r = await fc.check(properties[name](legacyScheme), { numRuns: RUNS });
      expect(r.failed).toBe(true);
      console.log(`legacy fails ${name}: ${String((r.errorInstance as Error)?.message ?? r.errorInstance).split('\n').slice(0, 3).join(' | ')}`);
    }, 60_000);
  }
  it("its uploader view signs a clino login as the user (v2 is checked in property 2)", async () => {
    await fc.assert(fc.asyncProperty(arbWorld, async (w) => {
      const grant = legacyScheme.uploaderGrant(w);
      const { tsv } = await legacyScheme.upload(grant, w.genome);
      expect(signsLoginFor([JSON.stringify(grant), tsv], tsv, w.user)).toBe(true);
    }), { numRuns: RUNS });
  }, 60_000);

  it('passes property 5 user reads all (positive control)', async () => {
    await fc.assert(properties['5 user reads all'](legacyScheme), { numRuns: RUNS });
  }, 60_000);
});
