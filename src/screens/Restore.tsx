import { useState } from 'react';
import { isValidMnemonic, isValidWord, normalizeMnemonic } from '../lib/crypto';
import { describeError, useStore } from '../store';
import { ErrorText, Screen, Spinner } from '../components/ui';

export function Restore({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { actions } = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mnemonic = normalizeMnemonic(text);
  const words = mnemonic ? mnemonic.split(' ') : [];
  const bad = words.filter((w) => !isValidWord(w));
  const valid = words.length === 12 && bad.length === 0 && isValidMnemonic(mnemonic);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await actions.restoreAccount(mnemonic);
      onDone();
    } catch (e) {
      setError(e instanceof Error && 'status' in e && e.status === 410 ? 'The server has no account for this phrase.' : describeError(e));
      setBusy(false);
    }
  };

  return (
    <Screen title="Restore account" onBack={onBack}>
      {busy ? (
        <Spinner label="Restoring your account…" />
      ) : (
        <>
          <p className="muted">Enter your twelve word recovery phrase.</p>
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="word1 word2 … word12" />
          <p className="muted small">
            {words.length}/12 words{bad.length ? ` · unknown: ${bad.join(', ')}` : words.length === 12 && !valid ? ' · checksum does not match' : ''}
          </p>
          <ErrorText error={error} />
          <button className="btn" disabled={!valid} onClick={submit}>Next</button>
        </>
      )}
    </Screen>
  );
}
