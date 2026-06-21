import { brand } from "@m/std";
import type { GanttDate } from "../core/ast.js";

// Smart constructor for a Gantt date. Validates ISO `YYYY-MM-DD` and that it names a real calendar day
// — a rolled-over date like `2024-02-31` (which `Date.UTC` would silently shift into March) is rejected
// by requiring the components to round-trip. Returns null on anything malformed, which the parser turns
// into a loud error, so an invalid date can't reach the AST. Shell-only (it holds the sanctioned cast),
// and the Gantt layout then reads the branded value through a total `parseDay` with no failure path.
export const ganttDate = (value: string): GanttDate | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const ms = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return brand<string, "GanttDate">(value);
};
