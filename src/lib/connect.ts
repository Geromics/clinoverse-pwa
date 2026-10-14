// Connection grant: the same validation and key material as the old ConnectionDialog.getEncryptedKeyData.
import { encryptAsymmetric, fileKeygen, unwrapFileKey, type Identity } from './crypto';
import { demoIdentity } from './demo';
import type { Provider, SessionInfo, StoredFile } from './api';

// Info items the user declares in the app ("My details"), not records in the genome file.
// Their values travel inside the encrypted envelope as `_values`; keep in sync with the providers.
export const INLINE_INFO: Record<string, string> = { shoe_size: 'shoe size' };
export const isInline = (id: string) => Object.hasOwn(INLINE_INFO, id);

export function buildKeysData(
  info: SessionInfo,
  opts: {
    identity: Identity | null; demo: boolean; providers: Provider[]; files: StoredFile[]; details?: Record<string, string>;
    wrappedKeys?: Record<string, string>; // POST /file/key: { [fileId]: wrapped file key }
  },
): string {
  const { providerDid, providerPublicKey, accessTo } = info;
  const validRequirements =
    Array.isArray(accessTo) &&
    accessTo
      .filter(({ SNPs }) => Array.isArray(SNPs) && SNPs.length > 0)
      .flatMap(({ SNPs }) => SNPs!)
      .every((snp) => typeof snp === 'string' && snp.length > 0);
  if (!validRequirements) throw new Error('Invalid request.');

  const receiver = opts.providers.find((p) => p.providerDid === providerDid);
  if (!receiver?.enabledInDemo && opts.demo) throw new Error('This service is not available for demo accounts.');
  const { identity } = opts;
  if (!identity) throw new Error('User identity is missing.');
  if (!receiver) throw new Error('Invalid or inactive service provider.');
  const receiverPublicKey = providerPublicKey || receiver.publicKey;

  const SNPs = accessTo.flatMap((a) => a.SNPs).filter((s): s is string => s !== undefined);
  if (SNPs.length > 0 && opts.files.length === 0) throw new Error('No files to share');
  const allInfo = accessTo.flatMap((a) => a.info).filter((s): s is string => s !== undefined);
  const infoItems = allInfo.filter((id) => !isInline(id));
  const inline = allInfo.filter(isInline);
  const values = Object.fromEntries(inline.map((id) => [id, opts.details?.[id]?.trim() ?? '']));
  const unset = inline.filter((id) => !values[id]);
  if (unset.length > 0) throw new Error(`Add your ${unset.map((id) => INLINE_INFO[id]).join(' and ')} under My details first.`);

  // The private key never leaves the phone; old uploaders asked for it as `master_key`.
  if (infoItems.includes('master_key')) throw new Error('This service asks for your private key. Clinoverse never shares it.');

  let keysData: Record<string, unknown>;
  if (infoItems.length === 1 && infoItems[0] === 'public_key') {
    keysData = { public_key: identity.publicKey }; // the uploader wraps a fresh file key to it
  } else if (infoItems.length === 0 && SNPs.length === 0) {
    keysData = {}; // only self-declared values: no file keys at all
  } else {
    const keygen = fileKeygen(fileRoot(identity, opts.files[0], opts.wrappedKeys));
    keysData = Object.fromEntries([...infoItems, 'header', ...SNPs].map((id) => [id, keygen(id)])); // header is always needed
  }
  if (inline.length > 0) keysData._values = values;
  if (typeof receiverPublicKey !== 'string' || receiverPublicKey.length !== 130) throw new Error('Invalid provider public key.');
  return encryptAsymmetric(keysData, receiverPublicKey, identity.keyPair);
}

// The secret a file's record keys derive from. A linked demo file (fileName === '') belongs to the
// demo account, so its key is unwrapped with the demo identity.
function fileRoot(identity: Identity, file: StoredFile | undefined, wrappedKeys: Record<string, string> = {}): string {
  const owner = file?.fileName === '' ? demoIdentity() : identity;
  const wrapped = file && wrappedKeys[file.fileId];
  if (wrapped) return unwrapFileKey(wrapped, owner.keyPair);
  // LEGACY (pre-v2 uploads, no `filekey` record): keys derive from the owner's private key, which the
  // old uploader held. Kept so old files still work. TODO: drop once every file has been re-uploaded.
  return owner.privateKey;
}
