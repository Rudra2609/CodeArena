# ⚔️ CodeArena

A production-grade online judge and personal code execution sandbox built entirely with Docker. Every code submission executes inside a freshly-spawned, isolated container with hard resource limits — mimicking the exact architecture used by competitive programming platforms like Codeforces, LeetCode, and AtCoder.

CodeArena comes with a **powerful Chrome Extension** that allows you to extract test cases from popular competitive programming websites with a single click and beam them directly into your local judge environment.

## 🚀 Key Features

* **Instant Test Case Extraction:** Includes a custom Chrome/Edge Extension that scrapes test cases from Codeforces, AtCoder, CSES, HackerRank, and CodeChef and automatically populates the editor.
* **True Docker Sandboxing:** User code is compiled and executed in ephemeral Docker containers (`python:3.11-slim`, `gcc:13`, `eclipse-temurin:21`, `node:20-alpine`) without internet access and with strict CPU/RAM/PID limits.
* **Modern UI:** A beautiful, responsive React frontend featuring a Monaco Editor (VS Code's editor).
* **Asynchronous Execution:** Uses Celery and Redis to queue and execute submissions in the background, updating the frontend in real-time.

## 🏗️ Architecture

```text
Browser → Nginx :8080
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

### Services (`docker-compose.yml`)

| Service    | Image / Build   | Port     | Role |
|------------|----------------|----------|------|
| `nginx`    | nginx:alpine    | 8080 ← host | Reverse proxy routing traffic to frontend and API |
| `frontend` | ./frontend      | 3000 internal | React + Monaco editor UI |
| `api`      | ./api           | 8000 internal | FastAPI: handles code submissions, polling, and data |
| `worker`   | ./worker        | —        | Celery worker — securely runs code inside isolated Docker containers |
| `flower`   | mher/flower     | 5555 ← host | Celery job monitor UI |
| `redis`    | redis:7-alpine  | —        | Job broker + async result cache |
| `postgres` | postgres:16     | —        | Stores problem history and submission states |

## ⚡ Quick Start

### 1. Launching the Judge Server
Clone the repository and start the Docker containers:
```bash
git clone https://github.com/YOUR_USERNAME/CodeArena.git
cd CodeArena

# Pre-pull runtime images (avoids cold start delay on your first submission)
make pull-images

# Build and start everything in the background
docker compose up --build -d
```
* **App UI:** http://localhost:8080
* **API Docs:** http://localhost:8080/api/docs
* **Flower Dashboard:** http://localhost:5555

### 2. Installing the Chrome Extension
To enable the one-click test case extractor:
1. Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`).
2. Turn on **Developer mode** (top right corner).
3. Click **"Load unpacked"** and select the `chrome-extension` folder located inside your CodeArena repository.
4. Pin the ⚔️ CodeArena icon to your toolbar! Navigate to any Codeforces or AtCoder problem and click the extension to beam it to your local server.

## 📝 Supported Languages

| Language   | Image           | Compile? |
|------------|----------------|----------|
| Python 3.11 | python:3.11-slim | Yes |
| C++ (g++17) | gcc:13          | Yes |
| C++ (g++23) | gcc:14          | Yes |
| Java 21     | eclipse-temurin:21-jdk-alpine | Yes |
| JavaScript (Node 20) | node:20-alpine  | Yes |

## 🛡️ Sandbox Security & Resource Limits
The worker container communicates with the **host** Docker daemon via a socket mount (`/var/run/docker.sock`). Every sandboxed execution container is a sibling container. 

The following limits are strictly enforced on every submission:
* **CPU:** 0.5 Cores
* **RAM:** 256 MB (Swap disabled)
* **PIDs:** 64 maximum processes (prevents fork bombs)
* **Network:** Completely disabled (no outbound internet)

## 📊 Verdicts

| Code | Meaning |
|------|---------|
| **AC**   | Accepted — output matches expected exactly |
| **WA**   | Wrong Answer — output does not match |
| **TLE**  | Time Limit Exceeded (Default: 5 seconds) |
| **MLE**  | Memory Limit Exceeded (> 256MB) |
| **RE**   | Runtime Error (Non-zero exit code) |
| **CE**   | Compilation Error (or syntax error in Python/JS) |
| **OK**   | Executed (Code ran successfully, but no expected output was provided to check against) |

## 📂 Project Structure

```text
CodeArena/
├── chrome-extension/    ← Browser extension for test-case extraction
├── docker-compose.yml   ← Core orchestration
├── Makefile             ← Helper commands
├── nginx/               ← Reverse proxy configurations
├── api/                 ← FastAPI backend + Database ORM
├── worker/              ← Celery worker + Docker SDK Sandbox executor
├── frontend/            ← React UI + Monaco Editor
└── db/                  ← PostgreSQL initialization scripts
```
