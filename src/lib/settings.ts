// Server URL: localStorage override > VITE_API_URL > page origin.
const KEY = 'clinoverse.server';

export function getServerUrl(): string {
  const stored = localStorage.getItem(KEY);
  return (stored || import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '');
}

export function setServerUrl(url: string) {
  const clean = url.trim().replace(/\/+$/, '');
  if (clean) localStorage.setItem(KEY, clean);
  else localStorage.removeItem(KEY);
}
