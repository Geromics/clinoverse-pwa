import { useState } from 'react';
import { describeError, useStore } from '../store';
import { ErrorText, Screen, Spinner } from '../components/ui';

export function Welcome({ onCreated, onRestore, onDemo }: { onCreated: () => void; onRestore: () => void; onDemo: () => void }) {
  const { actions } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (label: string, fn: () => Promise<void>, next: () => void) => async () => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      next();
    } catch (e) {
      setError(describeError(e));
      setBusy(null);
    }
  };

  return (
    <Screen title="Clinoverse">
      {busy ? (
        <Spinner label={busy} />
      ) : (
        <>
          <p className="muted">
            A decentralised identity (DID) is a self-owned identity that replaces usernames. Your keys stay on this device.
          </p>
          <ErrorText error={error} />
          <button className="btn" onClick={run('Creating your identity…', actions.createAccount, onCreated)}>Create a new account</button>
          <button className="btn secondary" onClick={onRestore}>Restore from 12 words</button>
          <button className="btn secondary" onClick={run('Opening the demo account…', actions.useDemo, onDemo)}>Explore with the demo account</button>
        </>
      )}
    </Screen>
  );
}
