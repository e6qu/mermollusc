import { moduleCoverage } from "../../tools/vitest.shared.mjs";

// wasm-relay.ts's loading mechanics (script injection, fetch, WebAssembly instantiation) are real browser
// API orchestration with no meaningful Node-side unit test — covered by the Playwright e2e suite instead
// (connectWasmRelay's wiring logic, the part most likely to have bugs, IS unit tested via an injectable
// fake). Ratchet lowered accordingly — see this module's own convention: just below current coverage.
export default moduleCoverage({ statements: 85, branches: 73, functions: 84, lines: 88 });
