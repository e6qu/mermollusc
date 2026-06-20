import type { Page } from "@playwright/test";

// Capture every pipeline failure the app logs, not just parse. `renderFromText` logs `parse failed:`,
// `layout failed:`, and `relax failed:` and then returns early — so a parse-only console filter lets a
// *layout* regression slip through with the previous diagram still on screen. Collecting all three (plus
// uncaught page errors) lets a "renders X" spec assert the render was genuinely clean.
export const watchPipelineErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && /(parse|layout|relax) failed/.test(m.text())) errors.push(m.text());
  });
  return errors;
};
