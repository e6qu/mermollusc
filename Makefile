# Root fan-out. Runs a target across every module in DAG order.
# `make <target>` → runs <target> in each module. `make graph` prints the DAG.

# DAG order (std first, app last). Importing upward is forbidden; see AGENTS.md §4.
MODULES := modules/std modules/contracts modules/parser modules/layout \
           modules/renderer modules/icons modules/builder modules/collab app/playground

FANOUT  := install build typecheck lint lint-fix fmt fmt-check \
           test test-unit test-int test-e2e cov clean doc-check check

.PHONY: $(FANOUT) graph doctor new-module deps-check hooks sast e2e-ui e2e-pages e2e-api collab-server pages-build

SEMGREP_VERSION := 1.166.0

$(FANOUT):
	@for m in $(MODULES); do \
	  echo "==> $$m: $@"; \
	  $(MAKE) --no-print-directory -C $$m $@ || exit $$?; \
	done

graph:
	@echo "std <- contracts <- { parser, layout, renderer, icons } <- builder <- collab <- app"

deps-check:
	@node tools/pick-version.mjs --verify-catalog

hooks:
	@pre-commit install --install-hooks

# Runs semgrep directly (not via pre-commit) so the pre-commit `sast` hook can call this.
sast:
	@uvx --from semgrep==$(SEMGREP_VERSION) semgrep scan --config p/default --error --quiet --skip-unknown-extensions modules app tools

e2e-ui:
	@$(MAKE) --no-print-directory -C app/playground test-e2e-ui

e2e-pages:
	@$(MAKE) --no-print-directory -C app/playground test-e2e-pages

e2e-api:
	@echo "no API packages yet; HTTP e2e will run here once an API module exists"

pages-build:
	@node tools/build-pages.mjs

# Collaborative relay (WebSocket). Run alongside `make -C app/playground run`, then open two tabs at
# /?collab&room=demo to edit together. Optional — the app runs fully single-user without it. Set
# PERSIST_DIR to keep rooms across restarts (default: in-memory).
collab-server:
	@PORT=$${PORT:-1234} node modules/collab/server/relay.mjs

doctor:
	@command -v pnpm >/dev/null || { echo "pnpm not found"; exit 1; }
	@command -v node >/dev/null || { echo "node not found"; exit 1; }
	@echo "node $$(node -v) / pnpm $$(pnpm -v) — ok"

# make new-module NAME=foo DESC="..." DEPS="@m/std,@m/contracts"
new-module:
	@test -n "$(NAME)" || { echo "usage: make new-module NAME=x DESC=... DEPS=a,b"; exit 1; }
	@node tools/new-module.mjs "$(NAME)" "$(DESC)" "$(DEPS)"
