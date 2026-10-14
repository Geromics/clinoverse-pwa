import { useCallback, useEffect, useState } from 'react';
import { describeError, useStore } from '../store';
import { Confirm, ErrorText, PinInput, Screen, Spinner } from '../components/ui';
import { ApiError } from '../lib/api';

export function Login({ onDone, onSettings }: { onDone: () => void; onSettings: () => void }) {
  const { state, actions } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unregistered, setUnregistered] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const demo = !!state.account?.demo;

  const login = useCallback(async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      await actions.login(pin);
      onDone();
    } catch (e) {
      const missing = e instanceof ApiError && (e.status === 401 || e.status === 410);
      setError(missing ? 'This account is not registered on the server.' : describeError(e));
      setUnregistered(missing);
      setBusy(false);
    }
  }, [actions, onDone]);

  // The demo account has no PIN: sign in straight away.
  useEffect(() => {
    if (demo && !busy && !error) void login('');
  }, [demo, busy, error, login]);

  return (
    <Screen title="Clinoverse" right={<button className="icon-btn" aria-label="Settings" onClick={onSettings}>&#9881;</button>}>
      {busy || (demo && !error) ? <Spinner label="Signing in…" /> : <PinInput label="Enter PIN" onComplete={login} />}
      <ErrorText error={error} />
      {unregistered ? <button className="btn secondary" onClick={() => setConfirmReset(true)}>Reset this device</button> : null}
      {confirmReset ? (
        <Confirm message="Remove the account from this device? You can restore it later from your 12 words." yes="Reset" onYes={actions.reset} onNo={() => setConfirmReset(false)} />
      ) : null}
    </Screen>
  );
}
