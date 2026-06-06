"""
executor.py  —  Docker-based sandboxed code execution

How it works
────────────
1. A temp directory on the HOST is created under /tmp/judge/<run_id>/
2. Source code and stdin are written to that directory
3. For compiled languages: a Docker container is spawned for compilation
4. A second container is spawned for execution with strict resource limits:
     • CPU  : 0.5 cores  (cpu_quota / cpu_period)
     • RAM  : 256 MB     (mem_limit + no swap)
     • PIDs : 64         (prevents fork bombs)
     • Net  : disabled   (no internet access)
     • FS   : code dir bind-mounted read-write, no other mounts
5. Output is captured; the container is removed automatically
6. The temp dir is cleaned up in the finally block

The key insight: because we mount /var/run/docker.sock from the host,
docker.from_env() talks to the HOST daemon.  Volume paths in
containers.run(..., volumes=...) are HOST paths, not paths inside
this worker container.  That is why we use a host bind-mount for
/tmp/judge rather than a named Docker volume.
"""

import os
import uuid
import time
import shutil
import logging
from pathlib import Path
from typing import Optional

import docker
import docker.errors

logger = logging.getLogger(__name__)

# ── Language configuration ─────────────────────────────────────
LANGUAGE_CONFIG: dict[str, dict] = {
    "python": {
        "image":    "python:3.11-slim",
        "filename": "solution.py",
        # py_compile does a full syntax parse and reports exact line/column.
        # Exit code 1 on SyntaxError → executor returns CE with the message.
        # Users see "CE  line 5: invalid syntax" instead of a confusing RE.
        "compile_cmd": "python -m py_compile /code/solution.py",
        "run_cmd":     "python /code/solution.py",
    },
    "cpp": {
        "image":       "gcc:13",
        "filename":    "solution.cpp",
        "compile_cmd": "g++ -O2 -std=c++17 -o /code/solution /code/solution.cpp",
        "run_cmd":     "cp /code/solution /tmp/solution && exec /tmp/solution",
    },
    "cpp23": {
        "image":       "gcc:14",
        "filename":    "solution.cpp",
        "compile_cmd": "g++ -O2 -std=c++23 -o /code/solution /code/solution.cpp",
        "run_cmd":     "cp /code/solution /tmp/solution && exec /tmp/solution",
    },
    "java": {
        # eclipse-temurin:21-jdk-alpine = OpenJDK 21 JDK on Alpine (includes javac)
        # Use JDK not JRE — JRE has no javac compiler
        "image":       "eclipse-temurin:21-jdk-alpine",
        "filename":    "Main.java",
        "compile_cmd": "javac /code/Main.java -d /code",
        "run_cmd":     "java -cp /code Main",
    },
    "javascript": {
        "image":       "node:20-alpine",
        "filename":    "solution.js",
        "compile_cmd": None,
        "run_cmd":     "node /code/solution.js",
    },
}

# ── Sandbox resource limits ────────────────────────────────────
# These are passed directly to docker-py's containers.run()
SANDBOX_LIMITS = {
    "cpu_quota":       50_000,   # 0.5 CPU  (50_000 / 100_000 default period)
    "cpu_period":     100_000,
    "mem_limit":       "256m",
    "memswap_limit":   "256m",   # = mem_limit  → swap disabled
    "pids_limit":      64,       # prevents fork bombs
    "network_disabled": True,    # no outbound internet
    "read_only":       False,    # compiled output needs write access
}

TIME_LIMIT_SEC   = int(os.getenv("TIME_LIMIT_SEC", "5"))
COMPILE_TIMEOUT  = 30   # seconds; compilation is allowed more time
TMP_BASE         = os.getenv("JUDGE_TMP_DIR", "/tmp/judge")


def execute_code(
    language: str,
    source_code: str,
    stdin: str = "",
) -> dict:
    """
    Execute source_code in an isolated Docker container.

    Returns
    -------
    dict with keys:
        verdict : "OK" | "CE" | "RE" | "TLE" | "MLE" | "ERR"
        output  : captured stdout+stderr (truncated to 10 KB)
        time_ms : wall-clock execution time in milliseconds
    """
    config = LANGUAGE_CONFIG.get(language)
    if not config:
        return {
            "verdict": "CE",
            "output":  f"Unsupported language: '{language}'",
            "time_ms": 0,
        }

    client = docker.from_env()
    run_id = uuid.uuid4().hex[:10]
    code_dir = Path(TMP_BASE) / run_id
    code_dir.mkdir(parents=True, exist_ok=True)

    try:
        # ── 1. Write files ────────────────────────────────────
        (code_dir / config["filename"]).write_text(source_code, encoding="utf-8")
        (code_dir / "stdin.txt").write_text(stdin, encoding="utf-8")
        host_path = str(code_dir)   # HOST filesystem path

        # ── 2. Compile / syntax-check (if needed) ────────────
        if config["compile_cmd"]:
            compile_result = _run_container(
                client=client,
                image=config["image"],
                command=f'sh -c "{config["compile_cmd"]} 2>&1"',
                host_path=host_path,
                timeout=COMPILE_TIMEOUT,
                limits={"mem_limit": "512m", "memswap_limit": "512m",
                        "network_disabled": True},
            )
            if compile_result["exit_code"] != 0:
                raw = compile_result["output"].strip()
                # For Python py_compile the path is an implementation detail
                # — strip it so users see a clean "line N: ..." message.
                clean = raw.replace("/code/solution.py", "solution.py")
                return {
                    "verdict": "CE",
                    "output":  _truncate(clean),
                    "time_ms": 0,
                }
            logger.info("Compilation / syntax check OK for run %s", run_id)

        # ── 3. Execute ────────────────────────────────────────
        # We wrap in `timeout` shell command as a belt-and-suspenders guard
        # on top of the docker wait timeout
        run_cmd = (
            f'sh -c "cat /code/stdin.txt | '
            f'timeout {TIME_LIMIT_SEC} sh -c \'{config["run_cmd"]}\'"'
        )
        t_start = time.monotonic()
        run_result = _run_container(
            client=client,
            image=config["image"],
            command=run_cmd,
            host_path=host_path,
            timeout=TIME_LIMIT_SEC + 3,
            limits=SANDBOX_LIMITS,
        )
        elapsed_ms = int((time.monotonic() - t_start) * 1000)

        # ── 4. Map exit code to verdict ───────────────────────
        if run_result["timed_out"]:
            return {"verdict": "TLE", "output": "TLE",
                    "time_ms": TIME_LIMIT_SEC * 1000}

        exit_code = run_result["exit_code"]

        if exit_code == 137:           # SIGKILL — OOM killer
            return {"verdict": "MLE", "output": "MLE",
                    "time_ms": elapsed_ms}

        if exit_code == 124:           # GNU timeout exit code
            return {"verdict": "TLE", "output": "TLE",
                    "time_ms": elapsed_ms}

        if exit_code not in (0, None):
            return {"verdict": "RE",
                    "output":  _truncate(run_result["output"]),
                    "time_ms": elapsed_ms}

        return {
            "verdict": "OK",
            "output":  run_result["output"].strip(),
            "time_ms": elapsed_ms,
        }

    except docker.errors.ImageNotFound:
        logger.error("Runtime image not found for language=%s", language)
        return {"verdict": "ERR",
                "output":  f"Runtime image not found for '{language}'",
                "time_ms": 0}
    except Exception as exc:
        logger.exception("Unexpected error executing run_id=%s", run_id)
        return {"verdict": "ERR", "output": str(exc)[:500], "time_ms": 0}
    finally:
        shutil.rmtree(str(code_dir), ignore_errors=True)


# ── Internal helper ────────────────────────────────────────────

def _run_container(
    client: docker.DockerClient,
    image: str,
    command: str,
    host_path: str,
    timeout: int,
    limits: dict,
) -> dict:
    """
    Spawn a container, wait for it, return output + exit code.

    The container is always removed after completion (even on timeout).
    """
    container: Optional[docker.models.containers.Container] = None
    timed_out = False

    try:
        container = client.containers.run(
            image=image,
            command=command,
            volumes={host_path: {"bind": "/code", "mode": "rw"}},
            detach=True,
            auto_remove=False,   # We remove manually after reading logs
            **limits,
        )

        try:
            result = container.wait(timeout=timeout)
            exit_code = result.get("StatusCode", -1)
        except Exception:
            # Timeout — kill the container
            timed_out = True
            exit_code = -1
            try:
                container.kill()
            except Exception:
                pass

        raw_logs = container.logs(stdout=True, stderr=True)
        output   = raw_logs.decode("utf-8", errors="replace")

        return {"output": output, "exit_code": exit_code, "timed_out": timed_out}

    except docker.errors.ContainerError as exc:
        stderr = exc.stderr.decode("utf-8", errors="replace") if exc.stderr else str(exc)
        return {"output": stderr, "exit_code": exc.exit_status, "timed_out": False}

    finally:
        if container:
            try:
                container.remove(force=True)
            except Exception:
                pass


def _truncate(s: str, limit: int = 10_240) -> str:
    """Truncate output to avoid storing huge blobs in the DB."""
    if len(s) <= limit:
        return s
    return s[:limit] + f"\n... [truncated at {limit} chars]"
