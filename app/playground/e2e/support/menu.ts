import type { Page } from "@playwright/test";

// Export / Share / Reset moved off the topbar into the "Export ▾" overflow menu. Open it so its items
// are visible and clickable. (Buttons checked only for disabled/title state stay queryable while hidden;
// a hidden file <input> still accepts setInputFiles — those callers don't need this.)
export const openExportMenu = async (page: Page): Promise<void> => {
  if (await page.locator("#more-menu").isHidden()) {
    await page.locator("#more-toggle").click();
  }
};
