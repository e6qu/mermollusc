# @m/layout — bugs

## RISK: elkjs ships no type definitions

`elkjs@0.11.1` has no bundled `.d.ts` we have confirmed, and `@types/elkjs` does not exist on
npm (verified 2026-06-14 via `npm view @types/elkjs version` → not found). Its API surface is
therefore untyped, which violates the type policy.

**Required handling:** the ELK call lives only in `src/shell`, wrapped by a hand-written typed
facade whose inputs/outputs pass through `decode()` (Zod). The core must never import elkjs or
see its raw result shape. Confirm the actual runtime shape against elkjs source before writing
the decoder — do not infer it from memory.
