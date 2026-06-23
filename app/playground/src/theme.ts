import { darkTheme, defaultTheme, type Theme } from "@m/renderer";
import { loadThemeChoice, saveThemeChoice } from "./persistence.js";

// Light/dark + sketch are the two orthogonal display axes. Light/dark is an explicit choice (persisted)
// that otherwise follows the OS; sketch (hand-drawn outlines + handwriting font) composes onto whichever
// is active, at paint time. Forced-colors (high-contrast OS mode) overrides both with system keywords.
const SKETCH_FONT = '15px "Comic Sans MS", "Patrick Hand", cursive';

const prefersDark = (): boolean =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

const forcedTheme = (font: string): Theme => ({
  background: "Canvas",
  nodeFill: "Canvas",
  stroke: "CanvasText",
  text: "CanvasText",
  font,
  sketch: false,
});

export interface ThemeController {
  // The theme to paint/measure with: the active palette composed with the sketch font, or the
  // forced-colors override when the OS high-contrast mode is on.
  readonly activeTheme: () => Theme;
  readonly isDark: () => boolean;
  // The label the toggle button shows — the mode it switches *to* (the opposite of the current one).
  readonly toggleLabel: () => string;
  // Flip light↔dark and persist the explicit choice.
  readonly toggleTheme: () => void;
  readonly isSketch: () => boolean;
  readonly toggleSketch: () => void;
}

export const createThemeController = (deps: {
  readonly forcedColors: () => boolean;
}): ThemeController => {
  const stored = loadThemeChoice();
  let theme: Theme =
    stored === "dark" || (stored === null && prefersDark()) ? darkTheme : defaultTheme;
  let sketch = false;

  const activeTheme = (): Theme => {
    const font = sketch ? SKETCH_FONT : theme.font;
    if (deps.forcedColors()) return forcedTheme(font);
    return sketch ? { ...theme, sketch: true, font } : theme;
  };

  return {
    activeTheme,
    isDark: () => theme === darkTheme,
    toggleLabel: () => (theme === defaultTheme ? "Dark" : "Light"),
    toggleTheme: () => {
      theme = theme === defaultTheme ? darkTheme : defaultTheme;
      saveThemeChoice(theme === darkTheme ? "dark" : "light");
    },
    isSketch: () => sketch,
    toggleSketch: () => {
      sketch = !sketch;
    },
  };
};
