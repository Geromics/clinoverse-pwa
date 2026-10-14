// Generate fresh Clinoverse provider keypairs and a demo account.
// Usage: node scripts/genkeys.mjs <old-providers.json> <out-public.json> <out-secrets.json>
import { readFileSync, writeFileSync } from 'node:fs';
import elliptic from 'elliptic';
import bs58 from 'bs58';
import sha3 from 'js-sha3';
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

const ec = new elliptic.ec('secp256k1');
const did = (kp) => 'did:clinoverse:' + bs58.encode(Uint8Array.from(kp.getPublic('array')));

const [, , oldPath, outPublic, outSecrets] = process.argv;
const old = JSON.parse(readFileSync(oldPath, 'utf8'));
const secrets = { providers: {}, demo: {} };
const pub = old.map((p) => {
  const kp = ec.genKeyPair();
  const { privateKey: _drop, ...rest } = p;
  const entry = { ...rest, providerDid: did(kp), publicKey: kp.getPublic('hex') };
  secrets.providers[p.providerName] = { providerDid: entry.providerDid, privateKey: kp.getPrivate('hex') };
  return entry;
});
const mnemonic = generateMnemonic(wordlist, 128);
const seed = [...mnemonicToSeedSync(mnemonic, '')];
const demoKp = ec.keyFromPrivate(sha3.keccak256(seed), 'hex');
secrets.demo = { mnemonic, did: did(demoKp), privateKey: demoKp.getPrivate('hex'), publicKey: demoKp.getPublic('hex') };
writeFileSync(outPublic, JSON.stringify(pub, null, 2) + '\n');
writeFileSync(outSecrets, JSON.stringify(secrets, null, 2) + '\n');
console.log(pub.map((p) => `${p.providerName}: ${p.providerDid}`).join('\n'));
console.log('demo:', secrets.demo.did);
