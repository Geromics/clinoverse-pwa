import { useEffect, useState } from 'react';
import { describeError, useStore } from '../store';
import { Confirm, ErrorText, ProviderLogo, Screen } from '../components/ui';
import type { Connection, Provider } from '../lib/api';
import { loadDetails, saveDetails } from '../lib/details';

type Tab = 'connections' | 'files' | 'services' | 'details';
const POLL_MS = 3000;

export function Home({ onScan, onSettings, onBackup }: { onScan: () => void; onSettings: () => void; onBackup: () => void }) {
  const { state, actions } = useStore();
  const [tab, setTab] = useState<Tab>('connections');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; run: () => Promise<unknown> } | null>(null);

  // Poll connections + files every 3s while this screen is mounted and the page is visible.
  useEffect(() => {
    let active = true;
    const tick = () => {
      if (!active || document.visibilityState !== 'visible') return;
      actions.refresh().then(() => setError(null), (e) => setError(describeError(e)));
    };
    actions.loadProviders().catch((e) => setError(describeError(e)));
    tick();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.token]);

  const providerOf = (did: string) => state.providers.find((p) => p.providerDid === did);
  const demo = !!state.account?.demo;
  const hasFile = state.files.length > 0;

  const ask = (message: string, run: () => Promise<unknown>) => setConfirm({ message, run });
  const doConfirm = async () => {
    const { run } = confirm!;
    setConfirm(null);
    try {
      await run();
    } catch (e) {
      setError(describeError(e));
    }
  };

  const connections = () => (
    <ul className="list">
      {state.connections.length === 0 ? <li className="muted">No active connections. Scan a QR code to connect a service.</li> : null}
      {state.connections.map((c) => (
        <ConnectionItem key={c.sessionId} c={c} provider={providerOf(c.providerDid)} onDelete={() => ask(`Disconnect from ${c.providerName || providerOf(c.providerDid)?.providerName || 'this service'}?`, () => actions.deleteConnection(c.sessionId))} />
      ))}
    </ul>
  );

  const files = () => (
    <ul className="list">
      {state.files.length === 0 ? <li className="muted">Your vault is empty. Use the File Uploader service to add your genome file.</li> : null}
      {state.files.map((f) => (
        <li key={f.fileId} className="item">
          <div className="grow">
            <b>{f.fileName === '' ? 'Demo file (linked)' : f.fileName}</b>
            <div className="muted small">{[f.fileLabel, f.fileType, f.createdAt ? new Date(f.createdAt).toLocaleString() : ''].filter(Boolean).join(' · ')}</div>
          </div>
          {!demo ? <button className="icon-btn" aria-label="Delete file" onClick={() => ask('Delete this file from your vault?', actions.deleteFile)}>&#128465;</button> : null}
        </li>
      ))}
    </ul>
  );

  const services = () => {
    const list = state.providers.filter((p) => Array.isArray(p.accessTo) && (!demo || p.enabledInDemo));
    return (
      <ul className="list">
        {list.length === 0 ? <li className="muted">No suitable services found.</li> : null}
        {list.map((p) => (
          <li key={p.providerDid} className="item">
            <ProviderLogo name={p.providerName} image={p.providerImage} />
            <div className="grow">
              <b>{p.providerName}</b>
              <div className="muted small">{p.description}</div>
              {p.providerType === 'institution' && !hasFile && p.accessTo!.some((a) => a.SNPs?.length) ? <div className="small warn">Upload a file with the File Uploader first.</div> : null}
            </div>
            {p.webAddress ? <a className="btn small" href={p.webAddress} target="_blank" rel="noreferrer">Open</a> : null}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Screen title="Clinoverse" right={<button className="icon-btn" aria-label="Settings" onClick={onSettings}>&#9881;</button>}>
      {state.account && !state.account.mnemonicNoted ? (
        <button className="banner" onClick={onBackup}>You have not backed up your account yet. Tap to see your recovery words.</button>
      ) : null}
      <nav className="tabs">
        {(['connections', 'files', 'services', 'details'] as Tab[]).map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </nav>
      <ErrorText error={error} />
      {tab === 'connections' ? connections() : tab === 'files' ? files() : tab === 'services' ? services() : <MyDetails />}
      <button className="fab" onClick={onScan}>Scan QR</button>
      {confirm ? <Confirm message={confirm.message} onYes={doConfirm} onNo={() => setConfirm(null)} /> : null}
    </Screen>
  );
}

function ConnectionItem({ c, provider, onDelete }: { c: Connection; provider?: Provider; onDelete: () => void }) {
  const name = c.providerName || provider?.providerName;
  return (
    <li className="item">
      <ProviderLogo name={name} image={c.providerImage || provider?.providerImage} />
      <div className="grow">
        <b>{name || c.providerDid.slice(0, 24) + '…'}</b>
        <div className="muted small">{c.description || provider?.description}</div>
        <div className="muted small">{c.createdAt ? new Date(c.createdAt).toLocaleString() : ''} {c.state ? `· ${c.state}` : ''}</div>
      </div>
      <button className="icon-btn" aria-label="Disconnect" onClick={onDelete}>&#128465;</button>
    </li>
  );
}

// Self-declared details, kept on this device only. A service sees one only if it asks and you accept.
function MyDetails() {
  const [shoe, setShoe] = useState(() => loadDetails().shoe_size ?? '');
  const [saved, setSaved] = useState(true);
  const save = () => {
    saveDetails({ ...loadDetails(), shoe_size: shoe });
    setSaved(true);
  };
  return (
    <div className="details">
      <p className="muted small">Kept on this device. Shared only when a service asks for it and you accept.</p>
      <label className="field">
        <span>Shoe size</span>
        <input value={shoe} maxLength={24} placeholder="e.g. 10 UK or 44 EU" onChange={(e) => { setShoe(e.target.value); setSaved(false); }} />
      </label>
      <button className="btn" onClick={save} disabled={saved}>{saved ? 'Saved' : 'Save'}</button>
    </div>
  );
}
