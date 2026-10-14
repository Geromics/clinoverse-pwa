import { useCallback, useState } from 'react';
import { describeError, useStore } from '../store';
import { ErrorText, PinInput, Screen, Spinner } from '../components/ui';

// Enter + repeat a 6-digit PIN, then seal the mnemonic with it.
export function SetPin({ onDone, currentPinRequired }: { onDone: () => void; currentPinRequired?: boolean }) {
  const { actions } = useStore();
  const [current, setCurrent] = useState<string | null>(null);
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onPin = useCallback(async (pin: string) => {
    setError(null);
    if (currentPinRequired && current === null) return setCurrent(pin);
    if (first === null) return setFirst(pin);
    if (pin !== first) {
      setFirst(null);
      return setError('PINs did not match. Try again.');
    }
    setBusy(true);
    try {
      if (currentPinRequired) await actions.changePin(current!, pin);
      else await actions.savePin(pin);
      onDone();
    } catch (e) {
      setError(describeError(e));
      setCurrent(null);
      setFirst(null);
      setBusy(false);
    }
  }, [actions, current, first, currentPinRequired, onDone]);

  const label = currentPinRequired && current === null ? 'Current PIN' : first === null ? 'Choose a 6-digit PIN' : 'Repeat the PIN';
  return (
    <Screen title={currentPinRequired ? 'Change PIN' : 'Set a PIN'}>
      {busy ? <Spinner /> : <PinInput key={label} label={label} onComplete={onPin} />}
      <ErrorText error={error} />
    </Screen>
  );
}
