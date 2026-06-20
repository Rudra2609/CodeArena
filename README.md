<div align="center">

# ⚔️ CodeArena

**A production-grade online judge and personal code execution sandbox — built entirely with Docker.**

Every submission runs inside a freshly-spawned, isolated container with hard CPU/RAM/PID limits, mirroring the architecture of Codeforces, LeetCode, and AtCoder. Paired with a powerful Chrome Extension that scrapes test cases from the world's top competitive programming platforms and beams them directly into your local judge with one click.

<br/>

![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Celery](https://img.shields.io/badge/Celery-5.4-37814A?logo=celery&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)

</div>

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture](#architecture)
- [Services](#services)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Chrome Extension](#chrome-extension)
- [Supported Languages](#supported-languages)
- [API Reference](#api-reference)
- [Authentication](#authentication)
- [Sandbox Security & Resource Limits](#sandbox-security--resource-limits)
- [Verdicts](#verdicts)
- [Makefile Commands](#makefile-commands)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)

---

## Key Features

- **True Docker Sandboxing** — User code compiles and runs inside ephemeral sibling containers (`python:3.11-slim`, `gcc:13/14`, `eclipse-temurin:21-jdk-alpine`, `node:20-alpine`) with no internet access and strict CPU/RAM/PID limits enforced at the kernel level.

- **Chrome Extension — One-Click Test Case Extraction** — Scrapes sample I/O from Codeforces, AtCoder, CSES, HackerRank, and CodeChef and populates your local judge instantly. Also supports auto-submitting your solution back to the original platform.

- **Asynchronous Execution Pipeline** — Submissions are queued via Celery + Redis and executed in the background. The frontend polls at 200ms intervals and updates the verdict badge in real time.

- **Multi-Tab Editor** — Work on multiple problems simultaneously with tabs that persist across browser sessions (localStorage). Each tab has its own language, code, and test cases.

- **Multi-Test-Case Runner** — Add unlimited custom test cases per problem and run them all in parallel. Individual cases can be triggered independently.

- **Monaco Editor** — Powered by VS Code's editor with syntax highlighting, JetBrains Mono / Fira Code font ligatures, and custom themes (VS Dark, Dracula, GitHub Dark).

- **JWT Authentication + OTP Verification** — Secure registration flow with email OTP (or console fallback). Bcrypt password hashing, 1-week JWT tokens, and a change-password endpoint.

- **Persistent Code Files** — Authenticated users can save, rename, and reload their code files from the backend. Files are tied to accounts and accessible across sessions.

- **Celery Flower Dashboard** — Real-time Celery task monitor exposed at port 5555.

- **Mobile Responsive** — The split editor/IO pane switches from horizontal to vertical layout on screens ≤ 768 px.

---

## Architecture

```
Browser ──→ Nginx :8080
               ├── /         ──→ Frontend  (React + Vite + Monaco Editor)
               └── /api/     ──→ API       (FastAPI + async SQLAlchemy)
               └── /health   ──→ API       (liveness probe)
                                    │
                          enqueue ──┤──→ Redis :6379 ←── Celery Worker
                                    │                         │
                        read/write ─┴──→ PostgreSQL :5432     │
                                                              │
                                         /var/run/docker.sock (socket mount)
                                                    │
                                           HOST Docker Daemon
                                                    │
                          ┌──────────┬──────────┬──────────┬──────────┐
                       python:3.11  gcc:13/14  temurin:21  node:20  ← ephemeral sandbox containers
                        (Python)    (C/C++)    (Java)    (JavaScript)
```

**Key design**: The worker container mounts `/var/run/docker.sock` from the host, so it communicates directly with the host Docker daemon. Code files are written to `/tmp/judge` on the **host** filesystem so the daemon can bind-mount them as `/code` into execution containers. Volume paths in `containers.run(volumes=...)` are always host paths — not paths inside the worker container.

---

## Services

| Service    | Image / Build               | Exposed Port | Role                                                              |
|------------|-----------------------------|--------------|-------------------------------------------------------------------|
| `nginx`    | `nginx:alpine`              | `8080 → 80`  | Reverse proxy routing traffic to frontend and API                 |
| `frontend` | `./frontend` (Vite + React) | internal 3000| Monaco editor UI with multi-tab code editor                       |
| `api`      | `./api` (FastAPI)           | internal 8000| Submission handler, auth, problems, code files                    |
| `worker`   | `./worker` (Celery)         | —            | Dequeues jobs, spawns Docker sandbox containers, writes results   |
| `flower`   | `mher/flower:2.0`           | `5555`       | Celery task monitor                                               |
| `redis`    | `redis:7-alpine`            | internal     | Job broker, async result cache, and OTP storage                   |
| `postgres` | `postgres:16-alpine`        | internal     | Problems, users, submissions, and code files                      |

All services share the `judge_net` bridge network. Only `nginx` (8080) and `flower` (5555) are exposed to the host.

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Docker Compose)
- Git

### 1. Clone and configure

```bash
git clone https://github.com/Rudra2609/CodeArena.git
cd CodeArena

# Copy the example env file and set your Postgres password
cp .env.example .env
# Edit .env and set POSTGRES_PASSWORD to something strong
```

### 2. Pre-pull sandbox images (recommended)

Pulling images before the first submission avoids a cold-start delay while a test case is waiting:

```bash
make pull-images
```

This pulls `python:3.11-slim`, `gcc:13`, `openjdk:21-slim`, and `node:20-alpine`.

### 3. Build and start

```bash
docker compose up --build -d
```

| URL | Description |
|-----|-------------|
| `http://localhost:8080` | App UI |
| `http://localhost:8080/api/docs` | Interactive API docs (Swagger) |
| `http://localhost:5555` | Flower — Celery job monitor |

### 4. Verify it works

```bash
make test-submit
```

This submits a Python "Hello, World!" program and polls until the verdict arrives.

---

## Environment Variables

Copy `.env.example` to `.env` before starting. The only required variable is `POSTGRES_PASSWORD`.

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | *(required)* | Password for the `judge` Postgres user |
| `DATABASE_URL` | auto-built from above | Override the full SQLAlchemy connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Celery broker / result backend |
| `TIME_LIMIT_SEC` | `5` | Wall-clock time limit for code execution (seconds) |
| `JUDGE_TMP_DIR` | `/tmp/judge` | Host path for temporary code files |
| `SECRET_KEY` | `super-secret-key-for-dev` | JWT signing secret — **change in production** |
| `SMTP_SERVER` | *(optional)* | SMTP host for OTP emails |
| `SMTP_PORT` | *(optional)* | SMTP port (`465` for SSL, `587` for STARTTLS) |
| `SMTP_USERNAME` | *(optional)* | SMTP login username |
| `SMTP_PASSWORD` | *(optional)* | SMTP login password |

> **Note on SMTP:** If SMTP credentials are not configured, OTP codes are printed to the API container's console instead of being emailed. Run `docker compose logs api` to retrieve them during development.

---

## Chrome Extension

The browser extension enables one-click test case extraction from competitive programming sites directly into your local judge.

### Installation

1. Open `chrome://extensions/` (or `edge://extensions/`).
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **"Load unpacked"** and select the `chrome-extension/` folder.
4. Pin the ⚔️ CodeArena icon to your toolbar.

Navigate to any supported problem page and click the extension to send all sample test cases to your local judge.

### Supported Platforms

| Platform | URL Pattern | What's Extracted |
|---|---|---|
| **Codeforces** | `codeforces.com/problemset/problem/*/*` | All sample inputs + outputs, problem title |
| **Codeforces** | `codeforces.com/contest/*/problem/*` | Contest problems |
| **Codeforces** | `codeforces.com/gym/*/problem/*` | Gym problems |
| **AtCoder** | `atcoder.jp/contests/*/tasks/*` | Sample cases from task statement |
| **HackerRank** | `hackerrank.com/challenges/*` | Sample I/O from problem statement |
| **CSES** | `cses.fi/problemset/task/*` | Example input/output |
| **CodeChef** | `codechef.com/problems/*` | Sample test cases |

### Extension Architecture

| File | Role |
|---|---|
| `manifest.json` | Manifest V3 definition with host permissions |
| `content.js` | Platform-specific DOM scrapers for all 5 sites |
| `popup.js` / `popup.html` / `popup.css` | Extension popup UI |
| `background.js` | Service worker — tab management, message routing, Turnstile CAPTCHA handling |
| `bridge.js` | Injected into `localhost` — listens for `submitToPlatform` events from the React app |
| `auto_submit.js` | Auto-submits your code back to the source platform when you click 🚀 Submit |
| `inject.js` | Injected into AtCoder and CodeChef pages for DOM access |

### How Test Cases Flow

```
Problem Page (e.g. Codeforces)
    ↓ content.js scrapes sample I/O
    ↓ background.js relays to popup
    ↓ popup.js base64-encodes cases
    ↓ background.js checks for an existing localhost:8080 tab
         ├── Tab found → reuse it (update URL + focus window)
         └── No tab    → open a new one
    ↓ URL: http://localhost:8080?cases=<b64>&lang=cpp&problem=<title>&source=<url>&_t=<timestamp>
    ↓ App.jsx decodes URL params → tab pre-loaded with test cases
```

### Auto-Submit & Turnstile Handling

When you click **🚀 Submit to Platform**, the extension:

1. Stores your code in `chrome.storage.local` (keeping the URL short — long base64 URLs in query params trigger Cloudflare Turnstile Error 600010).
2. Opens the problem page with `?judge_action=auto_submit` appended.
3. `auto_submit.js` retrieves the code from storage and injects it into the platform's editor using multiple fallback strategies: CodeMirror API → Monaco `editor.getModels()` → ACE editor → native textarea simulation with React synthetic events.
4. If Cloudflare Turnstile is detected, a `waitTurnstileAndSubmit` message is dispatched. The background worker polls every 500 ms for a valid token via four methods (Turnstile JS API → hidden input value → visual success indicator → `data-response` attribute). Once solved, the submit button is clicked automatically. A visual orange overlay prompts you to tick the "Verify you are human" checkbox if manual interaction is required. The poller times out after 5 minutes.

---

## Supported Languages

| Language | Docker Image | Compile Command | Run Command |
|---|---|---|---|
| Python 3.11 | `python:3.11-slim` | `python -m py_compile` (syntax check) | `python solution.py` |
| C++ 17 | `gcc:13` | `g++ -O2 -std=c++17` | Compiled binary |
| C++ 23 | `gcc:14` | `g++ -O2 -std=c++23` | Compiled binary |
| C (C11) | `gcc:14` | `gcc -O2 -std=c11` | Compiled binary |
| Java 21 | `eclipse-temurin:21-jdk-alpine` | `javac Main.java` | `java -cp /code Main` |
| JavaScript (Node 20) | `node:20-alpine` | *(none)* | `node solution.js` |

**Starter snippets** are pre-loaded for each language, including `#include <bits/stdc++.h>` with fast I/O for C++ — exactly as you'd write it on Codeforces.

---

## API Reference

All endpoints are prefixed with `/api/`. Interactive docs available at `http://localhost:8080/api/docs`.

### Submissions

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/submit` | No | Create a submission. Returns immediately with a `PENDING` submission. |
| `GET` | `/api/submissions/{id}` | No | Poll a submission's status and result. |
| `GET` | `/api/submissions` | No | List the last 50 submissions (most recent first). |

**POST `/api/submit` body:**

```json
{
  "language":        "python",
  "source_code":     "print('Hello, Judge!')",
  "stdin":           "",
  "expected_output": "Hello, Judge!",
  "problem_id":      null
}
```

**Submission response:**

```json
{
  "id":              "uuid",
  "problem_id":      null,
  "language":        "python",
  "source_code":     "...",
  "status":          "AC",
  "verdict":         "AC",
  "output":          "Hello, Judge!",
  "time_ms":         183.4,
  "created_at":      "2024-01-01T00:00:00",
  "completed_at":    "2024-01-01T00:00:01"
}
```

### Problems

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/problems` | No | List all seeded problems. |
| `GET` | `/api/problems/{id}` | No | Get a single problem with its stdin and expected output. |

### Code Files

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/files` | ✅ JWT | List the current user's saved files. |
| `POST` | `/api/files` | ✅ JWT | Save a new code file. |
| `GET` | `/api/files/{id}` | ✅ JWT | Get a single file. |
| `PUT` | `/api/files/{id}` | ✅ JWT | Update title, language, or source code. |
| `DELETE` | `/api/files/{id}` | ✅ JWT | Delete a file. |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe. Returns `{"status": "ok"}`. |

---

## Authentication

CodeArena uses JWT-based authentication with email OTP verification.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new account. Sends a 6-digit OTP to the provided email. |
| `POST` | `/api/auth/verify-otp` | Verify the OTP to activate the account. |
| `POST` | `/api/auth/login` | Login with email + password. Returns a Bearer token valid for 7 days. |
| `POST` | `/api/auth/change-password` | Change password (requires valid JWT). |

### Flow

```
Register (email + username + password)
    → OTP sent to email (or printed to console if SMTP not configured)
    → verify-otp with the 6-digit code
    → Account activated
    → Login → receive JWT token
    → Include token as: Authorization: Bearer <token>
```

OTPs are stored in Redis with a 5-minute TTL and deleted on successful verification. Passwords are hashed with bcrypt.

---

## Sandbox Security & Resource Limits

The worker communicates with the **host** Docker daemon via socket mount (`/var/run/docker.sock`). Every user submission spawns a **sibling container** (not a container inside the worker). This means:

- The worker container itself never executes untrusted code.
- Each submission gets a fresh, isolated container that is destroyed immediately after execution.
- Code files are written to a per-run temp directory (`/tmp/judge/<run_id>/`) on the host and bind-mounted read-write into `/code` inside the sandbox.

### Enforced Limits

| Limit | Value | Docker Param |
|---|---|---|
| CPU | 0.5 cores | `cpu_quota=50000` / `cpu_period=100000` |
| RAM | 256 MB | `mem_limit=256m` |
| Swap | 0 MB (disabled) | `memswap_limit=256m` |
| Max Processes | 64 | `pids_limit=64` (prevents fork bombs) |
| Network | Completely disabled | `network_disabled=True` |
| Time Limit | 5 seconds (default) | Shell `timeout` + Docker wait timeout |
| Compile Timeout | 30 seconds | Docker wait timeout on compile step |
| Output cap | 10 KB | Truncated before storing in DB |

### Belt-and-Suspenders Time Limit

The execution is wrapped in a shell `timeout` command **and** a Docker wait timeout (`TIME_LIMIT_SEC + 3s`). Exit code `124` (GNU timeout) and timed-out Docker waits both map to the `TLE` verdict. Exit code `137` (SIGKILL / OOM) maps to `MLE`.

---

## Verdicts

| Code | Full Name | Meaning |
|---|---|---|
| `AC` | Accepted | Output matches expected after line/whitespace normalisation |
| `WA` | Wrong Answer | Output does not match expected |
| `TLE` | Time Limit Exceeded | Execution exceeded 5 seconds (configurable) |
| `MLE` | Memory Limit Exceeded | Container killed by OOM (exit 137) |
| `RE` | Runtime Error | Non-zero exit code (crash, exception, assertion) |
| `CE` | Compilation Error | Compile step failed or Python syntax check failed |
| `OK` | Executed | Code ran without error but no expected output was provided |
| `ERR` | Internal Error | Docker image not found or unexpected exception |

**Output normalisation** before comparison: trailing whitespace stripped from each line, trailing blank lines removed. Case-sensitive.

---

## Makefile Commands

```bash
make help           # Show all available commands

# Lifecycle
make up             # Build images and start all services (background)
make down           # Stop containers (volumes preserved)
make build          # Rebuild images without starting
make logs           # Tail all container logs
make logs-worker    # Tail only the Celery worker logs
make logs-api       # Tail only the FastAPI logs

# Dev shells
make shell-api      # Open bash inside the running API container
make shell-worker   # Open bash inside the running worker container

# Images
make pull-images    # Pre-pull all sandbox runtime images

# Testing
make test-submit    # Submit a Python Hello World and poll for result
make test-python    # Submit a sum program against the p-sum-two problem

# Cleanup
make clean          # Stop containers AND remove all Docker volumes (destructive)
make clean-tmp      # Remove leftover /tmp/judge/* directories on the host
```

---

## Project Structure

```
CodeArena/
│
├── .env.example                 ← Environment variable template
├── docker-compose.yml           ← Full stack orchestration (7 services)
├── Makefile                     ← Developer shortcut commands
│
├── nginx/
│   └── nginx.conf               ← Reverse proxy: routes /api/ and / correctly
│
├── api/                         ← FastAPI backend
│   ├── Dockerfile
│   ├── requirements.txt         ← FastAPI, SQLAlchemy, asyncpg, Celery, passlib, jose
│   ├── main.py                  ← All HTTP endpoints (submissions, problems, files)
│   ├── auth.py                  ← JWT auth, OTP email, register/login/change-password
│   ├── models.py                ← SQLAlchemy ORM: User, Problem, Submission, CodeFile
│   ├── schemas.py               ← Pydantic request/response schemas
│   ├── database.py              ← Async engine + session factory
│   └── celery_client.py         ← Enqueue helper (sends jobs to Redis)
│
├── worker/                      ← Celery worker + Docker sandbox executor
│   ├── Dockerfile
│   ├── requirements.txt         ← Celery, docker-py, SQLAlchemy (sync), psycopg2
│   ├── celery_app.py            ← Celery app instance + Redis broker config
│   ├── tasks.py                 ← execute_submission task: PENDING → RUNNING → verdict
│   ├── executor.py              ← Core Docker sandbox: compile + run + resource limits
│   ├── judge.py                 ← Verdict logic: AC/WA/TLE/MLE/RE/CE/OK/ERR
│   └── __init__.py
│
├── frontend/                    ← React + Vite SPA
│   ├── Dockerfile
│   ├── package.json             ← React 18, Monaco Editor, react-split, Vite
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx             ← App entry point with ThemeProvider + AuthProvider
│       ├── App.jsx              ← Main component: editor, tabs, IO pane, submission
│       ├── index.css            ← Full dark-mode CSS (CSS variables, glass UI)
│       ├── api/
│       │   └── judgeApi.js      ← Fetch wrappers: submitCode, pollSubmission, auth, files
│       ├── context/
│       │   ├── AuthContext.jsx  ← User state + JWT token management
│       │   └── ThemeContext.jsx ← Theme switcher (vs-dark, dracula, github-dark)
│       └── components/
│           ├── AuthModals.jsx   ← Login, register, OTP verification modal
│           ├── FilesModal.jsx   ← Saved files browser
│           ├── SettingsModal.jsx← Theme selector
│           ├── Sidebar.jsx      ← Icon sidebar (editor, files, settings)
│           └── VerdictBadge.jsx ← Coloured verdict chip (AC=green, WA=red, etc.)
│
├── chrome-extension/            ← Manifest V3 browser extension
│   ├── manifest.json            ← Permissions, content scripts, service worker
│   ├── content.js               ← Platform scrapers for all 5 supported sites
│   ├── popup.html / popup.js / popup.css
│   ├── background.js            ← Service worker: message routing
│   ├── auto_submit.js           ← Auto-submit code back to source platform
│   ├── bridge.js                ← Localhost bridge: handles submitToPlatform events
│   ├── inject.js                ← Injected into AtCoder/CodeChef for DOM access
│   └── icons/                  ← icon16.png, icon48.png, icon128.png
│
└── db/
    └── init.sql                 ← Schema (problems, users, submissions, code_files)
                                   + 7 seeded problems (Hello World → Word Frequency)
```

---

## Tech Stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — async HTTP framework with auto-generated OpenAPI docs
- [SQLAlchemy 2](https://www.sqlalchemy.org/) + `asyncpg` — async ORM for PostgreSQL
- [Celery 5](https://docs.celeryq.dev/) + [Redis 7](https://redis.io/) — distributed task queue
- [docker-py](https://docker-py.readthedocs.io/) — Python Docker SDK for spawning sandbox containers
- [passlib](https://passlib.readthedocs.io/) + bcrypt — password hashing
- [python-jose](https://python-jose.readthedocs.io/) — JWT encoding/decoding
- [PostgreSQL 16](https://www.postgresql.org/) — persistent storage

**Frontend**
- [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/) — fast SPA bundler
- [@monaco-editor/react](https://github.com/suren-atoyan/monaco-react) — VS Code editor in the browser
- [react-split](https://github.com/nathancahill/split/tree/master/packages/react-split) — resizable editor/IO split pane
- JetBrains Mono / Fira Code — monospace fonts with ligatures

**Infrastructure**
- [Docker Compose](https://docs.docker.com/compose/) — single-command stack management
- [Nginx](https://nginx.org/) — reverse proxy with WebSocket support for Vite HMR
- [Flower](https://flower.readthedocs.io/) — real-time Celery task monitor

**Chrome Extension**
- Manifest V3 — content scripts, service worker, popup, injected scripts
- Native browser APIs only — no external dependencies

---

## Seed Problems

Seven problems are automatically seeded into the database on first run:

| ID | Title | Difficulty |
|---|---|---|
| `p-hello-world` | Hello World | Easy |
| `p-sum-two` | Sum of Two Numbers | Easy |
| `p-fibonacci` | Fibonacci Number | Easy |
| `p-palindrome` | Palindrome Check | Easy |
| `p-reverse` | Reverse a String | Easy |
| `p-two-sum` | Two Sum (sorted) | Medium |
| `p-word-count` | Word Frequency | Medium |

Load them from the sidebar or send `problem_id` in a submission to compare against the stored expected output.

---

## Production Hardening Notes

Before deploying publicly, make the following changes:

- Set a strong `SECRET_KEY` and `POSTGRES_PASSWORD` in `.env`.
- Change the `worker` service's `user: root` to a non-root user and use a dedicated Docker socket proxy (e.g. [Tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy)) to restrict API surface.
- Tighten CORS in `api/main.py` — replace `allow_origins=["*"]` with your actual frontend domain.
- Set `TIME_LIMIT_SEC` and consider per-language limits.
- Add rate limiting at the Nginx or FastAPI layer to prevent submission flooding.
- Configure real SMTP credentials so OTP emails are delivered.

---

<div align="center">

Made by [Rudra2609](https://github.com/Rudra2609) · Built for competitive programmers, by a competitive programmer

</div>
