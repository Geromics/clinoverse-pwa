// App state: React context + useReducer. At rest (localStorage): did, publicKey, PIN-sealed mnemonic.
// In memory only: identity (private key) and access token.
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { api, ApiError, type Connection, type Provider, type StoredFile } from './lib/api';
import { authParameters, identityFromMnemonic, createIdentity, type Identity } from './lib/crypto';
import { demoMnemonic } from './lib/demo';
import * as vault from './lib/vault';

export interface Account {
  did: string;
  publicKey: string;
  vault?: vault.Vault; // absent for the demo account (public mnemonic)
  demo?: boolean;
  mnemonicNoted: boolean;
}

export interface State {
  account: Account | null;
  identity: Identity | null;
  token: string | null;
  pendingCode: string | null;
  providers: Provider[];
  connections: Connection[];
  files: StoredFile[];
}

type Action =
  | { type: 'account'; account: Account | null }
  | { type: 'session'; identity: Identity; token: string }
  | { type: 'logout' }
  | { type: 'pendingCode'; code: string | null }
  | { type: 'data'; data: Partial<Pick<State, 'providers' | 'connections' | 'files'>> };

const ACCOUNT_KEY = 'clinoverse.account';

function loadAccount(): Account | null {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
  } catch {
    return null;
  }
}

const initial: State = {
  account: loadAccount(),
  identity: null,
  token: null,
  pendingCode: null,
  providers: [],
  connections: [],
  files: [],
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'account':
      return { ...state, account: action.account };
    case 'session':
      return { ...state, identity: action.identity, token: action.token };
    case 'logout':
      return { ...state, identity: null, token: null, connections: [], files: [] };
    case 'pendingCode':
      return { ...state, pendingCode: action.code };
    case 'data':
      return { ...state, ...action.data };
  }
}

export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return 'Cannot reach the server. Check the server address in Settings.';
    if (e.status === 401) return 'Authentication failed.';
    if (e.status === 403) return 'Permission denied.';
    if (e.status === 406) return 'Not allowed for the demo account.';
    if (e.status === 409) return 'Duplicate request.';
    if (e.status === 410) return 'Not found on the server.';
    if (e.status === 422) return 'Invalid request (incompatible app version?).';
    return `Server error (${e.status}).`;
  }
  return e instanceof Error ? e.message : String(e);
}

// Sign a fresh single-use challenge from clino and log in.
const signIn = async (identity: Identity) => (await api.auth(authParameters(identity, (await api.challenge()).nonce))).accessToken;

// POST /auth; on 401 (unknown user) optionally restore a backup or register, then retry once.
async function obtainToken(identity: Identity, fallback: 'restore' | 'register' | 'none'): Promise<string> {
  try {
    return await signIn(identity);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401 || fallback === 'none') throw e;
    if (fallback === 'restore') await api.restore({ userDid: identity.did });
    else await api.register({ userDid: identity.did, publicKey: identity.publicKey });
    return await signIn(identity);
  }
}

// Actions read the latest state through get(), so they are created once and never go stale.
function makeActions(get: () => State, dispatch: (a: Action) => void) {
  const session = (identity: Identity, token: string) => dispatch({ type: 'session', identity, token });
  const requireIdentity = () => {
    const { identity } = get();
    if (!identity) throw new Error('Not logged in.');
    return identity;
  };

  // Call clino with the token. Tokens expire after 12h (401): sign in again with the in-memory key
  // and retry once. Without a key in memory, drop the session so the app shows the PIN screen.
  const authed = async <T,>(call: (token: string) => Promise<T>): Promise<T> => {
    const { token, identity } = get();
    if (!token || !identity) {
      dispatch({ type: 'logout' });
      throw new Error('Not logged in.');
    }
    try {
      return await call(token);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) throw e;
      let fresh: string;
      try {
        fresh = await obtainToken(identity, 'none');
      } catch (err) {
        dispatch({ type: 'logout' });
        throw err;
      }
      session(identity, fresh);
      return call(fresh);
    }
  };

  const unlock = async (pin: string): Promise<string> => {
    const { account } = get();
    if (account?.demo) return demoMnemonic;
    if (!account?.vault) throw new Error('No account on this device.');
    try {
      return await vault.open(account.vault, pin);
    } catch {
      throw new Error('Wrong PIN.');
    }
  };

  const loadProviders = async (): Promise<Provider[]> => {
    const cached = get().providers;
    if (cached.length) return cached;
    const providers = await authed(api.providers);
    dispatch({ type: 'data', data: { providers } });
    return providers;
  };

  const loadFiles = async (): Promise<StoredFile[]> => {
    const files = await authed(api.files);
    dispatch({ type: 'data', data: { files } });
    return files;
  };

  const refresh = async () => {
    const [connections, files] = await Promise.all([authed(api.connections), authed(api.files)]);
    dispatch({ type: 'data', data: { connections, files } });
  };

  const reset = () => {
    localStorage.clear();
    dispatch({ type: 'logout' });
    dispatch({ type: 'account', account: null });
    dispatch({ type: 'data', data: { providers: [] } });
  };

  return {
    unlock,
    loadProviders,
    loadFiles,
    refresh,
    reset,
    async createAccount() {
      const identity = createIdentity();
      await api.register({ userDid: identity.did, publicKey: identity.publicKey });
      session(identity, await obtainToken(identity, 'none'));
    },
    async restoreAccount(mnemonic: string) {
      const identity = identityFromMnemonic(mnemonic);
      await api.restore({ userDid: identity.did });
      session(identity, await obtainToken(identity, 'none'));
    },
    async useDemo() {
      const identity = identityFromMnemonic(demoMnemonic);
      session(identity, await obtainToken(identity, 'register'));
      dispatch({ type: 'account', account: { did: identity.did, publicKey: identity.publicKey, demo: true, mnemonicNoted: true } });
    },
    async savePin(pin: string) {
      const identity = requireIdentity();
      const sealed = await vault.seal(identity.mnemonic, pin);
      dispatch({
        type: 'account',
        account: { did: identity.did, publicKey: identity.publicKey, vault: sealed, mnemonicNoted: get().account?.mnemonicNoted ?? false },
      });
    },
    // Wrong PIN => unlock throws.
    async login(pin: string) {
      const identity = identityFromMnemonic(await unlock(pin));
      session(identity, await obtainToken(identity, get().account?.demo ? 'register' : 'restore'));
    },
    async changePin(oldPin: string, newPin: string) {
      const mnemonic = await unlock(oldPin);
      dispatch({ type: 'account', account: { ...get().account!, vault: await vault.seal(mnemonic, newPin) } });
    },
    noteMnemonic() {
      const { account } = get();
      if (account) dispatch({ type: 'account', account: { ...account, mnemonicNoted: true } });
    },
    setPendingCode: (code: string | null) => dispatch({ type: 'pendingCode', code }),
    logout: () => dispatch({ type: 'logout' }),
    inspect: (sessionId: string) => authed((t) => api.inspectConnection(sessionId, t)),
    respond: (sessionId: string, grant: boolean, keysData: string | null) =>
      authed((t) => api.addConnection({ sessionId, grant, userDid: grant ? get().identity!.did : null, keysData: grant ? keysData : null }, t)),
    async deleteConnection(sessionId: string) {
      await authed((t) => api.deleteConnection(sessionId, t));
      await refresh();
    },
    async deleteFile() {
      await authed(api.deleteFile);
      await refresh();
    },
    async deleteUser() {
      await authed(api.deleteUser);
      reset();
    },
  };
}

export type Actions = ReturnType<typeof makeActions>;

const StoreContext = createContext<{ state: State; actions: Actions } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, initial);
  // Mirror state in a ref, applying actions eagerly so a fresh token is visible to the very next call.
  const ref = useRef(state);
  const actions = useMemo(() => {
    const dispatch = (a: Action) => {
      ref.current = reducer(ref.current, a);
      rawDispatch(a);
    };
    return makeActions(() => ref.current, dispatch);
  }, []);
  useEffect(() => {
    if (state.account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(state.account));
    else localStorage.removeItem(ACCOUNT_KEY);
  }, [state.account]);
  return <StoreContext.Provider value={{ state, actions }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}
