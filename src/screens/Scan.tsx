import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { parseCode, type SessionCode } from '../lib/session';
import { describeError, useStore } from '../store';
import { ErrorText, Screen } from '../components/ui';

// Minimal typing for the Shape Detection API (Chrome Android).
interface BarcodeDetectorLike { detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>; }
declare global {
  interface Window { BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorLike; }
}

export function Scan({ onBack, onCode }: { onBack: () => void; onCode: (code: SessionCode) => void }) {
  const { state, actions } = useStore();
  const video = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const done = useRef(false);

  // A code is accepted only for a known provider (same rule as the old QRScan screen).
  const accept = async (text: string) => {
    if (done.current) return;
    const code = parseCode(text);
    const providers = await actions.loadProviders().catch(() => state.providers);
    if (!code || !providers.some((p) => p.providerDid === code.providerDid)) {
      setError('Invalid code: unknown service provider.');
      return;
    }
    done.current = true;
    onCode(code);
  };

  useEffect(() => {
    const el = video.current!;
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    const canvas = document.createElement('canvas');
    const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;

    const scan = async () => {
      if (done.current || el.readyState < 2) return;
      try {
        if (detector) {
          const [hit] = await detector.detect(el);
          if (hit) void accept(hit.rawValue);
        } else {
          canvas.width = el.videoWidth;
          canvas.height = el.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(el, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (hit) void accept(hit.data);
        }
      } catch (e) {
        console.warn('scan failed', e);
      }
    };

    if (!navigator.mediaDevices) {
      setCameraError(window.isSecureContext ? 'no camera API' : 'the camera needs HTTPS or localhost');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s;
        el.srcObject = s;
        await el.play();
        timer = window.setInterval(scan, 250);
      })
      .catch((e) => setCameraError(describeError(e) + (window.isSecureContext ? '' : ' (camera needs HTTPS or localhost)')));

    return () => {
      window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen title="New connection" onBack={onBack}>
      <p className="muted">Point the camera at the QR code shown by the service.</p>
      <video ref={video} className="viewfinder" playsInline muted />
      {cameraError ? <p className="muted small">Camera unavailable: {cameraError}</p> : null}
      <p className="muted small">Or paste the code:</p>
      <div className="row">
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="session id" autoCapitalize="none" autoCorrect="off" />
        <button className="btn small" disabled={!manual.trim()} onClick={() => accept(manual)}>Go</button>
      </div>
      <ErrorText error={error} />
    </Screen>
  );
}
