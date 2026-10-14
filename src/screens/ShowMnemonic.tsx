import { useStore } from '../store';
import { Screen, Words } from '../components/ui';

export function ShowMnemonic({ mnemonic, onBack, onDone }: { mnemonic: string; onBack?: () => void; onDone: () => void }) {
  const { actions } = useStore();
  return (
    <Screen title="Back up your account" onBack={onBack}>
      <p className="muted">Write down these twelve words in order. They are the only way to recover your account.</p>
      <Words words={mnemonic.split(' ')} />
      <button className="btn" onClick={() => { actions.noteMnemonic(); onDone(); }}>I wrote it down</button>
    </Screen>
  );
}
