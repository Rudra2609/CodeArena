# CodeArena

A production-grade online judge built entirely with Docker. Every code submission executes inside a freshly-spawned, isolated container with hard resource limits — the same pattern used by Codeforces, LeetCode, and AtCoder under the hood.

## Architecture

```
Browser → Nginx :80
               ├── /         → Frontend  (React + Monaco editor)
               └── /api/     → API       (FastAPI)
                                  │
                                  ├── enqueue ──→  Redis  ←── Celery Worker
                                  │                                │
                                  └── read/write ──→  PostgreSQL   │
                                                                    │
                                              Docker daemon (socket mount)
                                                    │
                                  ┌──────┬──────┬──────┬──────┐
                                  Python  C++   Java  Node.js   ← ephemeral sandboxes
```

### Services (docker-compose.yml)

| Service    | Image / Build   | Port     | Role |
|------------|----------------|----------|------|
| `nginx`    | nginx:alpine    | 8080 ← host | Reverse proxy |
| `frontend` | ./frontend      | 3000 internal | React + Monaco editor |
| `api`      | ./api           | 8000 internal | FastAPI: submit, poll, problems |
| `worker`   | ./worker        | —        | Celery worker — runs code in Docker |
| `flower`   | mher/flower     | 5555 ← host | Celery job monitor UI |
| `redis`    | redis:7-alpine  | —        | Job broker + result cache |
| `postgres` | postgres:16     | —        | Problems + submissions |

## Key Docker Concepts Demonstrated

### 1. Docker socket mounting (the core idea)
```yaml
worker:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
    - /tmp/judge:/tmp/judge
```
The worker container can call `docker.from_env()` and it talks to the **host** Docker daemon. Every sandboxed execution container is a sibling container, not a child. `/tmp/judge` must be a host bind-mount so the daemon can find the path.

### 2. Sandbox resource limits
```python
SANDBOX_LIMITS = {
    "cpu_quota":       50_000,   # 0.5 CPU
    "cpu_period":     100_000,
    "mem_limit":       "256m",
    "memswap_limit":   "256m",   # no swap
    "pids_limit":      64,       # no fork bombs
    "network_disabled": True,    # no internet
}
```

### 3. Health checks for service ordering
```yaml
postgres:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U judge -d judge_db"]
    interval: 5s
    timeout: 3s
    retries: 10

api:
  depends_on:
    postgres:
      condition: service_healthy
```

### 4. Named volumes vs bind mounts
- `postgres_data`, `redis_data` → named volumes (Docker manages them)
- `/tmp/judge` → host bind-mount (required for sibling-container code sharing)

### 5. Multi-stage frontend build
The frontend Dockerfile has two stages: Node (build) → Nginx (serve). The final image contains only the compiled static assets.

## Quick Start

```bash
# 1. Clone and enter
git clone https://github.com/YOUR_USERNAME/CodeArena.git
cd CodeArena

# 2. Pre-pull runtime images (avoids cold start on first submission)
make pull-images

# 3. Start everything
make up

# 4. Test a submission
make test-submit
```

- App UI:    http://localhost:8080
- API docs:  http://localhost:8080/api/docs
- Flower:    http://localhost:5555

## Submission Flow

```
POST /api/submit
  → DB: INSERT submission (status=PENDING)
  → Redis: enqueue job
  → return { id, status: "PENDING" }

GET /api/submissions/{id}   ← frontend polls every 1s
  → return { status, verdict, output, time_ms }

Celery Worker (picks up from Redis):
  → DB: UPDATE status=RUNNING
  → Docker SDK: spawn container with source code bind-mounted
  → wait(timeout=8s), capture stdout/stderr
  → evaluate: compare output with expected
  → DB: UPDATE status=AC|WA|TLE|MLE|RE|CE
```

## Verdicts

| Code | Meaning |
|------|---------|
| AC   | Accepted — output matches expected |
| WA   | Wrong Answer |
| TLE  | Time Limit Exceeded (5s default) |
| MLE  | Memory Limit Exceeded (256MB) |
| RE   | Runtime Error (non-zero exit) |
| CE   | Compilation Error |
| OK   | Executed (no expected output) |

## Supported Languages

| Language   | Image           | Compile? |
|------------|----------------|----------|
| Python 3.11 | python:3.11-slim | No |
| C++ (g++17) | gcc:13          | Yes |
| C++ (g++23) | gcc:14          | Yes |
| Java 21     | eclipse-temurin:21-jdk-alpine | Yes |
| JavaScript (Node 20) | node:20-alpine  | No |

## Project Structure

```
CodeArena/
├── docker-compose.yml
├── .env.example
├── Makefile
├── nginx/
│   └── nginx.conf
├── api/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py          ← FastAPI app + endpoints
│   ├── models.py        ← SQLAlchemy ORM
│   ├── schemas.py       ← Pydantic request/response
│   ├── database.py      ← Async engine + session
│   └── celery_client.py ← Thin task dispatcher
├── worker/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── celery_app.py    ← Celery configuration
│   ├── tasks.py         ← Task entry point
│   ├── executor.py      ← Docker SDK sandbox  ← THE key file
│   └── judge.py         ← Verdict comparison
├── frontend/
│   ├── Dockerfile       ← Multi-stage Node → Nginx
│   ├── src/
│   │   ├── App.jsx      ← Main UI
│   │   ├── api/judgeApi.js
│   │   └── components/VerdictBadge.jsx
└── db/
    └── init.sql         ← Schema + seed problems
```

## CV talking points

- "Every submission spawns a freshly-created Docker container with 0.5 CPU, 256 MB RAM, no network, and PID limit — using the Docker Python SDK via socket mount"
- "Used Celery + Redis for async job queuing with `task_acks_late=True` for at-least-once delivery guarantees"
- "Nginx reverse-proxy routes `/api` to FastAPI and `/` to a multi-stage React build served by an embedded Nginx"
- "PostgreSQL health checks enforce proper startup ordering across all dependent services"
