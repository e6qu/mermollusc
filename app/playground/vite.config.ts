import process from "node:process";
import { defineConfig, loadEnv, type Plugin } from "vite";

const chunkOf = (id: string): string | undefined => {
  if (id.includes("/@codemirror/") || id.includes("/@lezer/")) return "editor";
  if (id.includes("/elkjs/")) return "layout-engine";
  if (id.includes("/yjs/") || id.includes("/y-codemirror.next/") || id.includes("/y-protocols/")) {
    return "collab";
  }
  if (id.includes("/@m/icons/") || id.includes("/modules/icons/")) return "icons";
  if (
    id.includes("/@m/parser/") ||
    id.includes("/@m/layout/") ||
    id.includes("/@m/renderer/") ||
    id.includes("/@m/builder/") ||
    id.includes("/modules/parser/") ||
    id.includes("/modules/layout/") ||
    id.includes("/modules/renderer/") ||
    id.includes("/modules/builder/")
  ) {
    return "pipeline";
  }
  return undefined;
};

// The CSP `connect-src` is assembled per build instead of hand-authored broad (`https: wss:` let a
// hypothetical script foothold reach ANY host). Local relay/dev targets are always allowed; the Auth0
// origin joins only when auth is configured; explicit deploy relays come from VITE_RELAY_ORIGINS
// (space-separated origins). Without an explicit list, non-demo builds keep `wss:` (the relay host is
// the page's own hostname on another port, which CSP cannot express generically — the app's
// same-origin `?ws=` guard covers the rest); the backend-free Pages demo opens no sockets at all, so
// it gets no network WebSocket source. Dev mode stays permissive for LAN testing.
const connectSrc = (env: Record<string, string>, mode: string): string => {
  const parts = [
    "'self'",
    "http://localhost:*",
    "http://127.0.0.1:*",
    "ws://localhost:*",
    "ws://127.0.0.1:*",
  ];
  const auth0 = env.VITE_AUTH0_DOMAIN;
  if (auth0 !== undefined && auth0 !== "") parts.push(`https://${auth0}`);
  if (mode !== "production") {
    parts.push("ws:", "wss:");
    return parts.join(" ");
  }
  const relays = env.VITE_RELAY_ORIGINS;
  if (relays !== undefined && relays !== "") {
    parts.push(...relays.split(/\s+/).filter((o) => o.length > 0));
  } else if (env.VITE_BACKEND_FREE_DEMO !== "1") {
    parts.push("wss:");
  }
  return parts.join(" ");
};

const cspPlugin = (env: Record<string, string>, mode: string): Plugin => ({
  name: "mermollusc-csp-connect-src",
  transformIndexHtml(html: string): string {
    if (!/connect-src [^;]*/.test(html)) {
      throw new Error("CSP transform found no connect-src directive to rewrite");
    }
    return html.replace(/connect-src [^;]*/, `connect-src ${connectSrc(env, mode)}`);
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [cspPlugin(env, mode)],
    build: {
      rollupOptions: {
        output: {
          manualChunks: chunkOf,
        },
      },
    },
  };
});
