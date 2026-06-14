# @m/layout — bugs

_None known._

## Resolved

- ~~elkjs ships no type definitions~~ — false: `elkjs@0.11.1` ships `lib/elk-api.d.ts`
  (verified 2026-06-14). We use the bundled entry `elkjs/lib/elk.bundled.js` and still decode the
  layout result with Zod at the shell boundary before it reaches the core.
