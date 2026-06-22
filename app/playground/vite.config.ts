import { defineConfig } from "vite";

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

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: chunkOf,
      },
    },
  },
});
