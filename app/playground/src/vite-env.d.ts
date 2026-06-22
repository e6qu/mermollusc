/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_FREE_DEMO: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
