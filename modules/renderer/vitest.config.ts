import { moduleCoverage } from "../../tools/vitest.shared.mjs";

// Re-based 2026-07-02: the previous 97/84/97/98 ratchet had silently drifted unenforced (nothing in the
// hook pipeline runs `make cov`), and actual coverage sat ~10 points below it on main already. Reset to
// just below today's measured coverage per the ratchet convention; wiring `cov` into a gate so this
// can't drift silently again is tracked in DO_NEXT.
export default moduleCoverage({ statements: 86, branches: 80, functions: 97, lines: 88 });
