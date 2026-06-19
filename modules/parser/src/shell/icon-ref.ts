import { err, ok, type Result } from "@m/std";
import type { IconRef } from "@m/contracts";

// `"<pack>/<name>"` → an icon ref, or an error message for a malformed one. Shared by the network /
// block / cloud parsers, which previously each dropped a bad ref to `null` (a silent default that
// rendered a wrong glyph and hid the user's typo). Callers fail the parse loudly on the error.
export const iconRefOf = (image: string): Result<IconRef, string> => {
  const slash = image.indexOf("/");
  if (slash <= 1 || slash >= image.length - 2) {
    return err(`malformed icon reference ${image} — expected "<pack>/<name>"`);
  }
  return ok({ pack: image.slice(1, slash), name: image.slice(slash + 1, -1) });
};
