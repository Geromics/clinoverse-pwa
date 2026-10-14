// "My details": self-declared values (e.g. shoe size) shared only inside a consented, encrypted grant.
// Stored in plain localStorage on this device: they are not secrets like the mnemonic, and never
// leave the device except in a grant the user accepts.
const KEY = 'clinoverse.details';

export type Details = Record<string, string>;

export function loadDetails(): Details {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '{}');
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  } catch {
    return {};
  }
}

export function saveDetails(details: Details) {
  const clean = Object.fromEntries(Object.entries(details).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  localStorage.setItem(KEY, JSON.stringify(clean));
}
