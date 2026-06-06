# ─────────────────────────────────────────────────────────────
#  Online Code Judge — Makefile
# ─────────────────────────────────────────────────────────────

.PHONY: help up down build logs shell-api shell-worker \
        pull-images test-submit clean

# ── Config ────────────────────────────────────────────────────
COMPOSE = docker compose
API_SVC = api
WORKER_SVC = worker

help:   ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ── Lifecycle ─────────────────────────────────────────────────
up: ## Build and start all services
	@cp -n .env.example .env 2>/dev/null || true
	$(COMPOSE) up --build -d
	@echo ""
	@echo "  App UI   → http://localhost"
	@echo "  API docs → http://localhost/api/docs"
	@echo "  Flower   → http://localhost:5555"

down: ## Stop and remove containers (volumes preserved)
	$(COMPOSE) down

build: ## Rebuild images without starting
	$(COMPOSE) build --no-cache

logs: ## Tail all logs
	$(COMPOSE) logs -f

logs-worker: ## Tail only worker logs
	$(COMPOSE) logs -f $(WORKER_SVC)

logs-api: ## Tail only API logs
	$(COMPOSE) logs -f $(API_SVC)

# ── Dev shells ────────────────────────────────────────────────
shell-api: ## Open bash in running API container
	$(COMPOSE) exec $(API_SVC) bash

shell-worker: ## Open bash in running worker container
	$(COMPOSE) exec $(WORKER_SVC) bash

# ── Images ────────────────────────────────────────────────────
pull-images: ## Pre-pull all sandbox runtime images (avoids cold start)
	docker pull python:3.11-slim
	docker pull gcc:13
	docker pull openjdk:21-slim
	docker pull node:20-alpine
	@echo "All sandbox images ready."

# ── Testing ───────────────────────────────────────────────────
test-submit: ## Submit a Python "Hello World" and poll for result
	@echo "Submitting Python Hello World..."
	@RESPONSE=$$(curl -s -X POST http://localhost/api/submit \
	  -H "Content-Type: application/json" \
	  -d '{"language":"python","source_code":"print(\"Hello, World!\")","expected_output":"Hello, World!"}'); \
	echo "Response: $$RESPONSE"; \
	ID=$$(echo $$RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])"); \
	echo "Submission ID: $$ID"; \
	sleep 4; \
	echo "Result:"; \
	curl -s http://localhost/api/submissions/$$ID | python3 -m json.tool

test-python: ## Submit a Python sum program against Problem 2
	curl -s -X POST http://localhost/api/submit \
	  -H "Content-Type: application/json" \
	  -d '{"language":"python","source_code":"a=int(input());b=int(input());print(a+b)","problem_id":"p-sum-two"}' | \
	  python3 -m json.tool

# ── Cleanup ───────────────────────────────────────────────────
clean: ## Stop containers and remove all volumes (destructive!)
	$(COMPOSE) down -v
	@echo "Volumes removed."

clean-tmp: ## Remove leftover judge temp dirs on host
	sudo rm -rf /tmp/judge/*
	@echo "/tmp/judge cleaned."
