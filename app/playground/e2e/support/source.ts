import { expect, type Page } from "@playwright/test";

// The source editor is CodeMirror, not a <textarea>, so `.fill()` / `toHaveValue()` don't apply.
// `main.ts` exposes a tiny `window.__editor` handle; reading/writing the document through CodeMirror's
// own state is the robust way to drive it from a test (no contenteditable / line-virtualisation
// fragility). These helpers wrap that handle so specs read like the old textarea ones.
declare global {
  interface Window {
    __editor?: { value(): string; setValue(text: string): void };
  }
}

const readSource = (page: Page): Promise<string> =>
  page.evaluate(() => window.__editor?.value() ?? "");

export const setSource = async (page: Page, text: string): Promise<void> => {
  await expect.poll(() => page.evaluate(() => window.__editor !== undefined)).toBe(true);
  await page.evaluate((t) => {
    window.__editor?.setValue(t);
  }, text);
};

export const sourceValue = (page: Page): Promise<string> => readSource(page);

// Replaces `expect(locator("#src")).toHaveValue(...)`: a regex matches a substring, a string is exact.
export const expectSourceMatches = async (
  page: Page,
  expected: RegExp | string,
): Promise<void> => {
  if (typeof expected === "string") {
    await expect.poll(() => readSource(page)).toBe(expected);
  } else {
    await expect.poll(() => readSource(page)).toMatch(expected);
  }
};

export const expectSourceNotMatches = async (page: Page, expected: RegExp): Promise<void> => {
  await expect.poll(() => readSource(page)).not.toMatch(expected);
};
