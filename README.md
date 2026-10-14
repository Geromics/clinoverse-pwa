# Clinoverse PWA

Installable web app that replaces the Clinoverse React Native app. It holds your
Clinoverse identity (a BIP39 phrase), signs in to the `clino` backend, and grants
services access to your genome file by scanning their QR code. It speaks exactly
the old app's protocol (see `src/lib/crypto.ts`, `src/lib/connect.ts`).

Storage: the phrase is sealed with your 6-digit PIN (PBKDF2-SHA256 150k + AES-GCM)
in `localStorage`. The private key and access token live in memory only.

## Env vars (build time)

| Var | Default | Meaning |
|---|---|---|
| `VITE_API_URL` | page origin | clino base URL, e.g. `http://clino.192-168-1-10.nip.io`. Users can override it in Settings. |
| `VITE_BASE` | `/` | URL base path (`/clinoverse-pwa/` on GitHub Pages) |
| `VITE_HTTPS` | unset | `1` = dev server with a self-signed cert |

## Develop

```sh
npm install
VITE_API_URL=http://localhost:3080 npm run dev   # listens on 0.0.0.0:5173
npx vitest run                                   # crypto tests use ../docker-compose-clinoverse and ../secrets when present
npx tsc -b --noEmit
```

### On a phone

The camera needs a secure context (HTTPS or localhost).

- Android over USB: `adb reverse tcp:5173 tcp:5173`, then open `http://localhost:5173` in Chrome.
  Also `adb reverse tcp:3080 tcp:3080` if clino runs locally.
- Any phone on the LAN: `VITE_HTTPS=1 npm run dev`, open `https://<lan-ip>:5173` and accept the cert.
- The full stack: open `http://app.<DEMO_DOMAIN>` (compose). On plain HTTP the camera is blocked, so paste
  the code by hand, or use the deep link `<app-url>/?code=<sessionId>`.

Install with "Add to Home screen".

## Build and deploy

```sh
npm run build                     # -> dist/
docker build -t clinoverse-pwa --build-arg VITE_API_URL=https://clino.example .   # Caddy on :80
```

GitHub Pages: `.github/workflows/pages.yml` tests and builds on push to `main` with
`VITE_BASE=/clinoverse-pwa/` and `VITE_API_URL` from the repository variable `API_URL`.
Enable Pages with source "GitHub Actions".
