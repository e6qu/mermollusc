MODULE := playground

# The app builds and runs with Vite, not tsup. Override the shared defaults.
BUILD_CMD := pnpm exec vite build
RUN_CMD   := pnpm exec vite --port 5173 & echo $$! > .run/playground.pid
STOP_CMD  := test -f .run/playground.pid && kill $$(cat .run/playground.pid) 2>/dev/null || true

include ../../module.mk

test-e2e-ui:
	pnpm exec playwright test

# Drive the live UI through named flows and write PNGs to shots/ (generated, git-ignored). Separate
# from the gating e2e suite — for visual review and design iteration, not a pass/fail gate.
shots:
	pnpm exec playwright test -c playwright.shots.config.ts
