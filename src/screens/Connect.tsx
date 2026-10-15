import { useEffect, useState } from 'react';
import { buildKeysData, isInline } from '../lib/connect';
import { loadDetails } from '../lib/details';
import type { AccessTo } from '../lib/api';
import type { SessionCode } from '../lib/session';
import { describeError, useStore } from '../store';
import { ErrorText, ProviderLogo, Screen, Spinner } from '../components/ui';

interface Request { providerName?: string; providerImage?: string; accessTo?: AccessTo[]; description?: string; }

export function Connect({ code, onBack, onDone }: { code: SessionCode; onBack: () => void; onDone: () => void }) {
  const { state, actions } = useStore();
  const [request, setRequest] = useState<Request | null>(null);
  const [keysData, setKeysData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [providers, files, info] = await Promise.all([actions.loadProviders(), actions.loadFiles(), actions.inspect(code.sessionId)]);
        if (cancelled) return;
        const wrappedKeys = files.length > 0 ? await actions.loadFileKeys() : {};
        if (cancelled) return;
        const fallback = providers.find((p) => p.providerDid === code.providerDid);
        setRequest({ providerName: info.providerName || fallback?.providerName, providerImage: info.providerImage || fallback?.providerImage, accessTo: info.accessTo, description: info.description || fallback?.description });
        setKeysData(buildKeysData(info, { identity: state.identity, demo: !!state.account?.demo, providers, files, details: loadDetails(), wrappedKeys }));
      } catch (e) {
        if (!cancelled) setError(describeError(e));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code.sessionId]);

  const respond = async (grant: boolean) => {
    setBusy(true);
    try {
      await actions.respond(code.sessionId, grant, keysData);
      onDone();
    } catch (e) {
      if (!grant) return onDone(); // ignore API errors when denying
      setError(describeError(e));
      setBusy(false);
    }
  };

  return (
    <Screen title="Add connection" onBack={onBack}>
      {!request && !error ? <Spinner label="Checking the request…" /> : null}
      {request ? (
        <>
          <div className="provider">
            <ProviderLogo name={request.providerName} image={request.providerImage} size={64} />
            <h2>{request.providerName || 'Unknown service'}</h2>
          </div>
          <p className="muted">would like to connect and</p>
          <ul className="bullets">
            {(request.accessTo || []).map((a, i) => {
              const inline = (a.info || []).filter(isInline);
              if (inline.length === 0) return <li key={i}>link to your <b>{a.label}</b></li>;
              const details = loadDetails();
              return <li key={i}>see your <b>{a.label}</b>: <b className="value">{inline.map((id) => details[id] || 'not set').join(', ')}</b></li>;
            })}
          </ul>
          {request.description ? <p className="muted small">{request.description}</p> : null}
        </>
      ) : null}
      <ErrorText error={error} />
      <div className="row">
        <button className="btn secondary" disabled={busy} onClick={() => respond(false)}>Deny</button>
        <button className="btn" disabled={busy || !keysData || !!error} onClick={() => respond(true)}>Accept</button>
      </div>
    </Screen>
  );
}
