// Shortcut hints are authored with the Apple modifier glyphs (⌘/⌥/⇧) as the no-JS default; on a
// non-Apple platform we swap each marked `[data-mod]` chip to the word form (Ctrl/Alt/Shift), since the
// handlers accept Ctrl too — otherwise Windows/Linux users see glyphs with no native equivalent.

type ModKey = "mod" | "alt" | "shift";

const isApplePlatform = (): boolean => {
  const nav: Navigator & { userAgentData?: { readonly platform?: string } } = navigator;
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent;
  return /mac|iphone|ipad/i.test(platform);
};

export const applyPlatformModifiers = (): void => {
  if (isApplePlatform()) return;
  const words: Record<ModKey, string> = { mod: "Ctrl", alt: "Alt", shift: "Shift" };
  const isModKey = (v: string): v is ModKey => v === "mod" || v === "alt" || v === "shift";
  for (const el of document.querySelectorAll<HTMLElement>("[data-mod]")) {
    const key = el.getAttribute("data-mod") ?? "";
    if (isModKey(key)) el.textContent = words[key];
  }
};
