/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { host: '0.0.0.0', port: 5173 },
  plugins: [
    react(),
    ...(process.env.VITE_HTTPS === '1' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Clinoverse',
        short_name: 'Clinoverse',
        description: 'Your personal genomic data vault',
        theme_color: '#d90452',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], navigateFallbackDenylist: [/^\/api/] },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
