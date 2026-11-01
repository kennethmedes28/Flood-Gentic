# Shortcuts for working on Flood-Gentic. Run `make` or `make help` to list them.
#
#   make run          start the backend and the frontend together
#   make test         backend tests
#   make check        everything that should pass before a commit

.DEFAULT_GOAL := help
.PHONY: help install run run-memory backend frontend test typecheck lint check build

BACKEND_PORT  ?= 8000
FRONTEND_PORT ?= 3000

help: ## Show this list
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'

# ---------------------------------------------------------------- setup

install: ## Install the backend (uv) and frontend (npm) packages
	cd backend && uv sync
	cd frontend && npm install

# ---------------------------------------------------------------- running

run: ## Run the backend and the frontend together (Ctrl+C stops both)
	hooks/run_all.sh --backend-port $(BACKEND_PORT) --frontend-port $(FRONTEND_PORT)

run-memory: ## Same as run, but chats are kept in memory instead of Postgres
	hooks/run_all.sh --memory --backend-port $(BACKEND_PORT) --frontend-port $(FRONTEND_PORT)

backend: ## Run only the FastAPI backend (auto-reloads)
	cd backend && uv run uvicorn main:app --reload --port $(BACKEND_PORT)

frontend: ## Run only the Next.js frontend
	cd frontend && PORT=$(FRONTEND_PORT) NEXT_PUBLIC_API_URL=http://localhost:$(BACKEND_PORT) npm run dev

# ---------------------------------------------------------------- checks

test: ## Run the backend tests
	cd backend && uv run python -m unittest discover -s tests

typecheck: ## Type-check the frontend
	cd frontend && npm run typecheck

lint: ## Lint the frontend
	cd frontend && npm run lint

check: test typecheck lint ## Backend tests, then frontend type check and lint

build: ## Build the frontend for production
	cd frontend && npm run build
