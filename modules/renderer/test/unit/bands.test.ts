import { describe, expect, it } from "vitest";
import { bandFill, darkTheme, defaultTheme } from "../../src/shell/paint.js";

// Regression: the dark `sectionAlt` band was `#0f172a` — identical to the dark background — so every
// other Gantt zebra stripe was invisible. Each band must differ from the background and from the other
// bands so the zebra and the non-working-day column actually read.
describe("bandFill", () => {
  for (const theme of [defaultTheme, darkTheme]) {
    const name = theme === darkTheme ? "dark" : "light";
    it(`${name}: every band differs from the background`, () => {
      for (const fill of ["section", "sectionAlt", "excluded"] as const) {
        expect(bandFill(fill, theme)).not.toBe(theme.background);
      }
    });
    it(`${name}: the three band fills are mutually distinct`, () => {
      const fills = [
        bandFill("section", theme),
        bandFill("sectionAlt", theme),
        bandFill("excluded", theme),
      ];
      expect(new Set(fills).size).toBe(3);
    });
  }
});
