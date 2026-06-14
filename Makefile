# Root fan-out. Runs a target across every module in DAG order.
# `make <target>` → runs <target> in each module. `make graph` prints the DAG.

# DAG order (std first, app last). Importing upward is forbidden; see AGENTS.md §4.
MODULES := modules/std modules/contracts modules/parser modules/layout \
           modules/renderer modules/icons modules/builder app/playground

FANOUT  := install build typecheck lint lint-fix fmt fmt-check \
           test test-unit test-int test-e2e cov clean doc-check check

.PHONY: $(FANOUT) graph doctor new-module deps-check

$(FANOUT):
	@for m in $(MODULES); do \
	  echo "==> $$m: $@"; \
	  $(MAKE) --no-print-directory -C $$m $@ || exit $$?; \
	done

graph:
	@echo "std <- contracts <- { parser, layout, renderer, icons } <- builder <- app"

deps-check:
	@node tools/pick-version.mjs --verify-catalog

doctor:
	@command -v pnpm >/dev/null || { echo "pnpm not found"; exit 1; }
	@command -v node >/dev/null || { echo "node not found"; exit 1; }
	@echo "node $$(node -v) / pnpm $$(pnpm -v) — ok"

# make new-module NAME=foo DESC="..." DEPS="@m/std,@m/contracts"
new-module:
	@test -n "$(NAME)" || { echo "usage: make new-module NAME=x DESC=... DEPS=a,b"; exit 1; }
	@node tools/new-module.mjs "$(NAME)" "$(DESC)" "$(DEPS)"
