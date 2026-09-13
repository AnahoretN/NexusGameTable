/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly PROD: boolean;
  readonly SSR: boolean;
  readonly VITE_DEBUG?: string;
  readonly PACKAGE_VERSION: string;
  readonly APP_NAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// `process.env` is statically replaced by `vite.config.ts` (`define: { 'process.env': {} }`),
// so referencing it in browser code is safe at build time. Declared here to keep
// feature flags and dev-only guards type-checked without pulling in @types/node.
declare const process: { env: Record<string, string | undefined> };
