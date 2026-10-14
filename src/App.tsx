import { useEffect, useState } from 'react';
import { useStore } from './store';
import { codeFromUrl, parseCode, type SessionCode } from './lib/session';
import { Welcome } from './screens/Welcome';
import { Restore } from './screens/Restore';
import { ShowMnemonic } from './screens/ShowMnemonic';
import { SetPin } from './screens/SetPin';
import { Login } from './screens/Login';
import { Home } from './screens/Home';
import { Scan } from './screens/Scan';
import { Connect } from './screens/Connect';
import { Settings } from './screens/Settings';

type Route =
  | { name: 'welcome' | 'restore' | 'mnemonic' | 'setpin' | 'login' | 'home' | 'scan' | 'settings' | 'backup' }
  | { name: 'connect'; code: SessionCode };

const AUTHED = new Set(['home', 'scan', 'connect', 'settings', 'backup', 'mnemonic', 'setpin']);

export default function App() {
  const { state, actions } = useStore();
  const [route, setRoute] = useState<Route>({ name: state.account ? 'login' : 'welcome' });
  const go = (name: Exclude<Route, { name: 'connect' }>['name']) => setRoute({ name });

  // Deep link: /?code=<sessionId>. Remember it, strip it from the URL, use it once logged in.
  useEffect(() => {
    const code = codeFromUrl(window.location.search);
    if (code) {
      actions.setPendingCode(code);
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After login / onboarding: pending code wins over Home.
  const enter = () => {
    const parsed = state.pendingCode ? parseCode(state.pendingCode) : null;
    actions.setPendingCode(null);
    setRoute(parsed ? { name: 'connect', code: parsed } : { name: 'home' });
  };

  // Session lost (401/403 or server change) on an authenticated screen: back to login / welcome.
  if (!state.token && AUTHED.has(route.name)) {
    return state.account ? <Login onDone={enter} onSettings={() => go('settings')} /> : <Welcome onCreated={() => go('mnemonic')} onRestore={() => go('restore')} onDemo={enter} />;
  }

  switch (route.name) {
    case 'welcome':
      return <Welcome onCreated={() => go('mnemonic')} onRestore={() => go('restore')} onDemo={enter} />;
    case 'restore':
      return <Restore onBack={() => go('welcome')} onDone={() => go('setpin')} />;
    case 'mnemonic':
      return <ShowMnemonic mnemonic={state.identity!.mnemonic} onDone={() => go('setpin')} />;
    case 'setpin':
      return <SetPin onDone={enter} />;
    case 'login':
      return <Login onDone={enter} onSettings={() => go('settings')} />;
    case 'home':
      return <Home onScan={() => go('scan')} onSettings={() => go('settings')} onBackup={() => go('backup')} />;
    case 'backup':
      return <ShowMnemonic mnemonic={state.identity!.mnemonic} onBack={() => go('home')} onDone={() => go('home')} />;
    case 'scan':
      return <Scan onBack={() => go('home')} onCode={(code) => setRoute({ name: 'connect', code })} />;
    case 'connect':
      return <Connect code={route.code} onBack={() => go('home')} onDone={() => go('home')} />;
    case 'settings':
      return <Settings onBack={() => go(state.token ? 'home' : state.account ? 'login' : 'welcome')} />;
  }
}
