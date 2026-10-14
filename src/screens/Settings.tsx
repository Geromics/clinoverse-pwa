import { useState } from 'react';
import { getServerUrl, setServerUrl } from '../lib/settings';
import { describeError, useStore } from '../store';
import { Confirm, ErrorText, PinInput, Screen, Words } from '../components/ui';
import { SetPin } from './SetPin';

type Mode = 'menu' | 'reveal' | 'words' | 'changePin';

export function Settings({ onBack }: { onBack: () => void }) {
  const { state, actions } = useStore();
  const [server, setServer] = useState(getServerUrl());
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<Mode>('menu');
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'reset' | 'deleteUser' | null>(null);
  const demo = !!state.account?.demo;
  const loggedIn = !!state.token;

  const save = () => {
    setServerUrl(server);
    setServer(getServerUrl());
    setSaved(true);
    actions.logout(); // tokens are per server
  };

  const reveal = async (pin: string) => {
    try {
      setMnemonic(await actions.unlock(pin));
      setMode('words');
      setError(null);
    } catch (e) {
      setError(describeError(e));
    }
  };

  if (mode === 'changePin') return <SetPin currentPinRequired onDone={() => setMode('menu')} />;

  return (
    <Screen title="Settings" onBack={mode === 'menu' ? onBack : () => { setMode('menu'); setMnemonic(null); setError(null); }}>
      {mode === 'menu' ? (
        <>
          <label className="field">
            <span>Server URL</span>
            <input value={server} onChange={(e) => { setServer(e.target.value); setSaved(false); }} inputMode="url" autoCapitalize="none" placeholder="https://clino.example" />
          </label>
          <button className="btn secondary" onClick={save} disabled={server === getServerUrl() && saved}>{saved ? 'Saved' : 'Save server URL'}</button>
          {state.account ? (
            <>
              <button className="btn secondary" onClick={() => (demo ? reveal('') : setMode('reveal'))}>Show recovery phrase</button>
              <button className="btn secondary" disabled={demo} onClick={() => setMode('changePin')}>Change PIN</button>
              {loggedIn && !demo ? <button className="btn secondary" onClick={() => setConfirm('deleteUser')}>Delete account on server</button> : null}
            </>
          ) : null}
          <button className="btn danger" onClick={() => setConfirm('reset')}>Reset app</button>
          <div className="muted small">
            <p>Version {__APP_VERSION__}{demo ? ' · demo account' : ''}</p>
            {state.account ? <p className="mono">{state.account.did}</p> : null}
          </div>
        </>
      ) : null}
      {mode === 'reveal' ? <PinInput label="Enter PIN to show your recovery phrase" onComplete={reveal} /> : null}
      {mode === 'words' && mnemonic ? <Words words={mnemonic.split(' ')} /> : null}
      <ErrorText error={error} />
      {confirm === 'reset' ? (
        <Confirm message="Remove the account and all settings from this device? Keep your 12 words to restore it." yes="Reset" onYes={() => { actions.reset(); onBack(); }} onNo={() => setConfirm(null)} />
      ) : null}
      {confirm === 'deleteUser' ? (
        <Confirm message="Delete your account on the server? A backup is kept server-side and restored on next login." yes="Delete" onYes={() => actions.deleteUser().then(onBack, (e) => { setConfirm(null); setError(describeError(e)); })} onNo={() => setConfirm(null)} />
      ) : null}
    </Screen>
  );
}
