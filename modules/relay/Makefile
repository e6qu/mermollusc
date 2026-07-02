# modules/relay — Go, not TypeScript, so this doesn't include ../../module.mk (that's pnpm/biome/tsc
# specific). Same target NAMES as every other module for the root fan-out; Go-appropriate bodies:
#   typecheck = go build (compilation IS Go's type check — there's no separate step)
#   lint      = go vet (Go's static analysis tool; no extra lint dependency added)
#   fmt-check = gofmt -l (pure formatting, distinct from vet — mirrors the TS lint/fmt-check split)

MODULE := relay

.PHONY: install build typecheck lint lint-fix fmt fmt-check \
        test test-unit test-int test-e2e test-watch cov \
        run stop clean doc-check check build-wasm test-wasm

install:    ; go mod download
build:      ; go build ./...
typecheck:  ; go build ./...
lint:       ; go vet ./...
lint-fix:   ; gofmt -w .
fmt:        ; gofmt -w .
fmt-check:
	@unformatted="$$(gofmt -l .)"; \
	if [ -n "$$unformatted" ]; then \
	  echo "not gofmt-clean:"; echo "$$unformatted"; exit 1; \
	fi

test:       ; go test ./...
# relay/ + store/ are pure-logic unit tests (no network/socket); auth/ + cmd/ drive a real local
# HTTP/JWKS/WebSocket harness — the module's rough unit/integration split.
test-unit:  ; go test ./relay/... ./store/...
test-int:   ; go test ./auth/... ./cmd/...
test-e2e:
	@echo "no e2e suite here — app/playground's e2e-ui exercises this relay end-to-end as the real backend"
test-watch: ; go test ./... -count=1
# -coverpkg=./... credits cross-package coverage (relay.Core is exercised mostly through
# cmd/relay-server's integration harness, which plain per-package profiles don't count). The awk gate is
# the enforced ratchet — same convention as the TS modules' vitest thresholds: set just below current
# coverage, raise as it climbs, never lower silently.
COV_MIN := 69
cov:
	@go test ./... -coverprofile=coverage.out -covermode=atomic -coverpkg=./...
	@go tool cover -func=coverage.out | tail -1
	@go tool cover -func=coverage.out | awk -v min=$(COV_MIN) '/^total:/ { sub(/%/, "", $$NF); if ($$NF + 0 < min) { printf "ERROR: total coverage %s%% is below the %s%% ratchet\n", $$NF, min; exit 1 } }'

check: typecheck lint fmt-check test

run:
	@PORT=$${PORT:-1234} go run ./cmd/relay-server
stop:
	@echo "[$(MODULE)] no persistent process tracked here — stop the foreground go run, or kill by PORT"

# cmd/relay-wasm is //go:build js && wasm — native `build`/`test`/`check` above skip it transparently
# (the build constraint excludes it under any non-js/wasm GOOS/GOARCH). These two targets are the
# explicit, demo-build-shaped verification for that path: build-wasm mirrors what tools/build-pages.mjs
# does; test-wasm drives the real compiled output through Go's own Node-based WASM test runner
# (go_js_wasm_exec, which ships alongside wasm_exec.js at $(go env GOROOT)/lib/wasm) — genuine execution,
# not a native-side approximation.
build-wasm:
	@GOOS=js GOARCH=wasm go build -o relay.wasm ./cmd/relay-wasm
test-wasm:
	@PATH="$$(go env GOROOT)/lib/wasm:$$PATH" GOOS=js GOARCH=wasm go test ./cmd/relay-wasm/...

clean:      ; rm -f coverage.out relay-server relay.wasm

doc-check:
	@for f in PLAN STATUS WHAT_WE_DID DO_NEXT BUGS; do \
	  test -s $$f.md || { echo "[$(MODULE)] missing or empty $$f.md"; exit 1; }; \
	done
	@echo "[$(MODULE)] docs ok"
