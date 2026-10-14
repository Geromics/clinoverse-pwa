/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare const __APP_VERSION__: string;
interface ImportMetaEnv { readonly VITE_API_URL?: string; readonly VITE_BASE?: string; }
