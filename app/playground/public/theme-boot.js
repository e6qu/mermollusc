// Render-blocking on purpose: sets data-theme before the first paint so a dark-mode user never sees a
// light flash. Loaded as a classic (non-module, non-deferred) script — a module would be deferred past
// first paint, and CSP (script-src 'self') rules out an inline script. Only the attribute is decided
// here; src/theme.ts remains the single owner of theme state and must agree on this resolution rule
// (explicit stored choice, else the OS preference).
try {
  var storedTheme = localStorage.getItem("mermollusc-theme");
  if (
    storedTheme === "dark" ||
    (storedTheme === null && window.matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
} catch (e) {
  console.error("theme pre-paint failed:", e);
}
