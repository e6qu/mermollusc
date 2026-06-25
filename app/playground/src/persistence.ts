import { messageOf } from "@m/std";

// Everything the playground persists is a localStorage key namespaced "mermollusc-", so Reset can wipe
// the group in one sweep. The source text, the sidecar overlay (manual positions + groups), and the
// light/dark choice each get one key.
const SOURCE_KEY = "mermollusc-source";
const OVERLAY_KEY = "mermollusc-overlay";
const THEME_KEY = "mermollusc-theme";
const COLLAPSE_KEY = "mermollusc-source-collapsed";
const NAMESPACE = "mermollusc-";

export const loadSource = (): string | null => localStorage.getItem(SOURCE_KEY);
export const saveSource = (text: string): void => localStorage.setItem(SOURCE_KEY, text);

export const loadOverlay = (): string | null => localStorage.getItem(OVERLAY_KEY);
export const saveOverlay = (serialized: string): void =>
  localStorage.setItem(OVERLAY_KEY, serialized);

export const loadThemeChoice = (): string | null => localStorage.getItem(THEME_KEY);
export const saveThemeChoice = (mode: "dark" | "light"): void =>
  localStorage.setItem(THEME_KEY, mode);

export const loadSourceCollapsed = (): boolean => localStorage.getItem(COLLAPSE_KEY) === "1";
export const saveSourceCollapsed = (collapsed: boolean): void =>
  localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");

// Drop everything the app persists — every namespaced key — so the demo comes back fresh. Collected
// first because removing during iteration shifts `localStorage.key(i)`.
export const clearPersisted = (): void => {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(NAMESPACE)) keys.push(k);
  }
  for (const k of keys) localStorage.removeItem(k);
};

// One decoded value from the `#…` hash (a shared link). `encodeURIComponent` (not `+`-for-space form)
// produced each value, so we decode with `decodeURIComponent` per key rather than `URLSearchParams`
// (which would turn a literal `+` in the source into a space). A malformed value is logged and ignored.
export const hashValue = (key: string): string | null => {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  for (const part of hash.split("&")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq) !== key) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1));
    } catch (e) {
      console.error("ignoring malformed URL hash for key", key, messageOf(e));
      return null;
    }
  }
  return null;
};
