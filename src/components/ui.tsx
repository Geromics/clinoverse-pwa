import { useEffect, useRef, useState, type ReactNode } from 'react';
import { initialOf, providerImageUrl } from '../lib/images';

export function Screen({ title, onBack, right, children }: { title: string; onBack?: () => void; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="screen">
      <header className="header">
        {onBack ? <button className="icon-btn" aria-label="Back" onClick={onBack}>&larr;</button> : <span className="icon-btn" />}
        <h1>{title}</h1>
        {right ?? <span className="icon-btn" />}
      </header>
      <main className="content">{children}</main>
      <footer className="version">v{__APP_VERSION__}</footer>
    </div>
  );
}

export const ErrorText = ({ error }: { error?: string | null }) => (error ? <p className="error" role="alert">{error}</p> : null);

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="center">
      <div className="spinner" aria-label="Loading" />
      {label ? <p className="muted">{label}</p> : null}
    </div>
  );
}

// Six-digit PIN. Calls onComplete when full, then clears itself.
export function PinInput({ label, onComplete, disabled, length = 6 }: { label: string; onComplete: (pin: string) => void; disabled?: boolean; length?: number }) {
  const [pin, setPin] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    if (pin.length === length) {
      onComplete(pin);
      setPin('');
    }
  }, [pin, length, onComplete]);
  return (
    <label className="pin">
      <span>{label}</span>
      <div className="dots" aria-hidden>
        {Array.from({ length }, (_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      <input
        ref={ref}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={length}
        value={pin}
        disabled={disabled}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, length))}
      />
    </label>
  );
}

export function Words({ words }: { words: string[] }) {
  return (
    <ol className="words">
      {words.map((w, i) => <li key={i}>{w}</li>)}
    </ol>
  );
}

export function Confirm({ message, onYes, onNo, yes = 'Delete' }: { message: string; onYes: () => void; onNo: () => void; yes?: string }) {
  return (
    <div className="modal" role="dialog">
      <div className="card">
        <p>{message}</p>
        <div className="row">
          <button className="btn secondary" onClick={onNo}>Cancel</button>
          <button className="btn danger" onClick={onYes}>{yes}</button>
        </div>
      </div>
    </div>
  );
}

// A provider's logo, or the first letter of its name if it has none (or it fails to load).
export function ProviderLogo({ name, image, size = 40 }: { name?: string; image?: string; size?: number }) {
  const src = providerImageUrl(image);
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src)
    return <span className="logo avatar" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden>{initialOf(name)}</span>;
  return <img className="logo" src={src} alt="" width={size} height={size} onError={() => setFailed(src)} />;
}
