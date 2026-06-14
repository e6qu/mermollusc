MODULE := playground

# The app builds and runs with Vite, not tsup. Override the shared defaults.
BUILD_CMD := pnpm exec vite build
RUN_CMD   := pnpm exec vite --port 5173 & echo $$! > .run/playground.pid
STOP_CMD  := test -f .run/playground.pid && kill $$(cat .run/playground.pid) 2>/dev/null || true

include ../../module.mk
