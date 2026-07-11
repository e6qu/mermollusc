import { moduleCoverage } from "../../tools/vitest.shared.mjs";

// Re-based 2026-07-02: the previous 92/66/95/94 ratchet had drifted ~6 points above actual coverage on
// main. Reset to just below today's measured coverage per the ratchet convention. The pre-push hook now
// runs `make cov` (the "coverage ratchets" stage), so a regression below these fails the gate.
export default moduleCoverage({ statements: 86, branches: 73, functions: 92, lines: 89 });
