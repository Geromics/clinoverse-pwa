// QR / deep-link code parsing. Code = "<sessionId>" or "<sessionId> <providerPublicKeyHex>".
export interface SessionCode {
  sessionId: string;
  providerDid: string;
  providerPublicKey?: string;
}

// A QR may also hold the deep link itself (<APP_URL>/?code=<sessionId>), so a phone camera can open it.
export function parseCode(text: string): SessionCode | null {
  if (/^https?:\/\//i.test(text.trim())) {
    const code = URL.canParse(text.trim()) ? codeFromUrl(new URL(text.trim()).search) : null;
    return code ? parseCode(code) : null;
  }
  const [sessionId, providerPublicKey] = text.trim().split(/\s+/, 2);
  if (!sessionId || sessionId.length <= 8) return null;
  return {
    sessionId,
    providerDid: 'did:clinoverse:' + sessionId.slice(0, -8),
    providerPublicKey,
  };
}

export const codeFromUrl = (search: string) => new URLSearchParams(search).get('code');
