# Shared make targets — included by every module's Makefile.
# A module's Makefile sets `MODULE := <name>` then `include ../../module.mk`.
# Override RUN_CMD / STOP_CMD / BUILD_CMD as needed (the app does).

MODULE   ?= $(notdir $(CURDIR))
REPO     := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
EXEC     := pnpm exec
VITEST   := $(EXEC) vitest run --passWithNoTests
GUARD    := node $(REPO)/tools/guard-types.mjs

BUILD_CMD ?= $(EXEC) tsup src/index.ts --format esm --dts --clean --silent
RUN_CMD   ?= $(MAKE) --no-print-directory test-watch
STOP_CMD  ?= true
PID_FILE  ?= .run/$(MODULE).pid

.PHONY: install build typecheck lint lint-fix fmt fmt-check \
        test test-unit test-int test-e2e test-watch cov \
        run stop clean doc-check check

install:    ; pnpm install
build:      ; $(BUILD_CMD)
typecheck:  ; $(EXEC) tsc --noEmit
lint:       ; $(EXEC) biome lint src && $(GUARD) src/core
lint-fix:   ; $(EXEC) biome lint --write src
fmt:        ; $(EXEC) biome format --write src
fmt-check:  ; $(EXEC) biome format src

test: test-unit test-int
test-unit:  ; $(VITEST) test/unit
test-int:   ; $(VITEST) test/integration
test-e2e:   ; @echo "no e2e suite for $(MODULE)"
test-watch: ; $(EXEC) vitest
cov:        ; $(EXEC) vitest run --coverage --passWithNoTests test/unit test/integration

check: typecheck lint fmt-check test

run:
	@mkdir -p .run
	@echo "[$(MODULE)] run: $(RUN_CMD)"
	@$(RUN_CMD)
stop:
	@echo "[$(MODULE)] stop"
	@$(STOP_CMD)

clean:      ; rm -rf dist coverage .run *.tsbuildinfo

doc-check:
	@for f in PLAN STATUS WHAT_WE_DID DO_NEXT BUGS; do \
	  test -s $$f.md || { echo "[$(MODULE)] missing or empty $$f.md"; exit 1; }; \
	done
	@echo "[$(MODULE)] docs ok"
