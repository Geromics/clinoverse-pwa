import { describe, expect, it } from 'vitest';
import { codeFromUrl, parseCode } from './session';

const sid = 'SEVnVSWpuYYcQeuJwHu8rVhhbNwGSEZeB8ZWB3EcuZVYdfbFEQBCysMaRaPtrCV8fGirms3SA3M99mRGa5exAkurABCDEFGH';

describe('parseCode', () => {
  it('derives providerDid from the session id minus the last 8 chars', () => {
    expect(parseCode(sid)).toEqual({
      sessionId: sid,
      providerDid: 'did:clinoverse:SEVnVSWpuYYcQeuJwHu8rVhhbNwGSEZeB8ZWB3EcuZVYdfbFEQBCysMaRaPtrCV8fGirms3SA3M99mRGa5exAkur',
      providerPublicKey: undefined,
    });
    expect(parseCode(` ${sid} 04ab `)?.providerPublicKey).toBe('04ab');
    expect(parseCode('')).toBeNull();
    expect(parseCode('short')).toBeNull();
  });
  it('accepts the deep link itself (QR codes a phone camera can open)', () => {
    expect(parseCode(`https://app.example.org/?code=${sid}`)?.sessionId).toBe(sid);
    expect(parseCode(`http://app.127-0-0-1.nip.io/clinoverse-pwa/?code=${encodeURIComponent(sid)}`)?.sessionId).toBe(sid);
    expect(parseCode('https://example.org/?nothing=1')).toBeNull();
  });
  it('reads ?code= from a query string', () => {
    expect(codeFromUrl('?code=' + sid)).toBe(sid);
    expect(codeFromUrl('?x=1')).toBeNull();
  });
});
