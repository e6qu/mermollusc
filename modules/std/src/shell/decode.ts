// Sanctioned boundary: the only place untyped external input (`unknown`) may enter. Validates
// via a Zod schema and returns a typed value or a loud error; the core never sees raw input.

import type { z } from "zod";
import { err, ok, type Result } from "../core/result.js";

export interface DecodeError {
  readonly kind: "decode";
  readonly issues: readonly string[];
}

export const decode = <T>(schema: z.ZodType<T>, input: unknown): Result<T, DecodeError> => {
  const parsed = schema.safeParse(input);
  if (parsed.success) return ok(parsed.data);
  return err({ kind: "decode", issues: parsed.error.issues.map((issue) => issue.message) });
};
