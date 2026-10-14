// clino REST client. Same paths, bodies and headers as the old app's api/*.js.
import { getServerUrl } from './settings';

export class ApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`${status} ${body}`.trim());
    this.status = status;
  }
}

export interface AccessTo { label: string; SNPs?: string[]; info?: string[]; }
export interface Provider {
  providerDid: string;
  providerName: string;
  providerImage?: string;
  providerType: 'institution' | 'application';
  webAddress?: string;
  publicKey: string;
  accessTo?: AccessTo[];
  enabledInDemo?: boolean;
  description?: string;
}
export interface Connection {
  sessionId: string;
  providerDid: string;
  providerName?: string;
  providerImage?: string;
  description?: string;
  createdAt?: number;
  state?: string;
}
export interface StoredFile {
  fileId: string;
  fileName: string;
  fileType?: string;
  fileLabel?: string;
  fileDesc?: string;
  createdAt?: number;
}
export interface SessionInfo {
  providerDid: string;
  providerName?: string;
  providerImage?: string;
  providerType?: string;
  providerPublicKey?: string;
  accessTo?: AccessTo[];
  description?: string;
  state?: string;
}

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let res: Response;
  try {
    res = await fetch(`${getServerUrl()}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new ApiError(0, 'Network error: ' + (e as Error).message);
  }
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, text);
  try {
    return JSON.parse(text) as T;
  } catch {
    return { response: text } as T;
  }
}

export interface AuthParams { userDid: string; message: string; signedMessage: string; }

export const api = {
  auth: (p: AuthParams) => call<{ accessToken: string }>('POST', 'auth', p),
  register: (p: { userDid: string; publicKey: string }) => call<unknown>('POST', 'auth/register', p),
  restore: (p: { userDid: string }) => call<unknown>('POST', 'auth/restore', p),
  providers: (token: string) => call<Provider[]>('GET', 'providers', undefined, token),
  inspectConnection: (sessionId: string, token: string) => call<SessionInfo>('POST', 'connection/inspect', { sessionId }, token),
  addConnection: (p: { sessionId: string; grant: boolean; userDid: string | null; keysData: string | null }, token: string) =>
    call<unknown>('POST', 'connection', p, token),
  connections: (token: string) => call<Connection[]>('POST', 'connection/getlist', undefined, token),
  deleteConnection: (sessionId: string, token: string) => call<unknown>('DELETE', 'connection', { sessionId }, token),
  files: (token: string) => call<StoredFile[]>('POST', 'file/getlist', undefined, token),
  deleteFile: (token: string) => call<unknown>('DELETE', 'file', undefined, token),
  deleteUser: (token: string) => call<unknown>('DELETE', 'user', undefined, token),
};
