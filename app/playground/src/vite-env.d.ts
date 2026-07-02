/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_FREE_DEMO: string | undefined;
  readonly VITE_AUTH0_AUDIENCE: string | undefined;
  readonly VITE_AUTH0_CLIENT_ID: string | undefined;
  readonly VITE_AUTH0_DOMAIN: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
