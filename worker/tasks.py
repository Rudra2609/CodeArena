"""
tasks.py  —  Celery task definitions

The single task execute_submission:
  1. Marks the submission as RUNNING in the DB
  2. Calls executor.execute_code() which spawns a Docker sandbox
  3. Calls judge.evaluate_verdict() to get the final verdict
  4. Writes the result back to the DB
"""

import logging
from datetime import datetime

from sqlalchemy import create_engine, text
import os

from worker.celery_app import celery_app
from worker.executor import execute_code
from worker.judge import evaluate_verdict

logger = logging.getLogger(__name__)

# Sync SQLAlchemy engine — Celery tasks are synchronous
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://judge:password@postgres:5432/judge_db",
)
_engine = create_engine(DATABASE_URL, pool_pre_ping=True)


@celery_app.task(name="worker.tasks.execute_submission")
def execute_submission(
    submission_id:   str,
    language:        str,
    source_code:     str,
    stdin:           str = "",
    expected_output: str = "",
) -> dict:
    """
    Entry point called by Celery when a submission job is dequeued.
    """
    logger.info("Starting execution: submission_id=%s language=%s",
                submission_id, language)

    # ── Mark as RUNNING ───────────────────────────────────────
    _update_status(submission_id, "RUNNING")

    # ── Execute in Docker sandbox ─────────────────────────────
    exec_result = execute_code(
        language=language,
        source_code=source_code,
        stdin=stdin,
    )
    logger.info(
        "Execution complete: submission_id=%s verdict=%s time_ms=%s",
        submission_id,
        exec_result.get("verdict"),
        exec_result.get("time_ms"),
    )

    # ── Determine final verdict ───────────────────────────────
    verdict = evaluate_verdict(
        execution_result=exec_result,
        expected_output=expected_output,
    )

    # ── Write result to DB ────────────────────────────────────
    _write_result(
        submission_id=submission_id,
        verdict=verdict,
        output=exec_result.get("output", ""),
        time_ms=exec_result.get("time_ms", 0),
    )

    return {"submission_id": submission_id, "verdict": verdict}


# ── DB helpers ─────────────────────────────────────────────────

def _update_status(submission_id: str, status: str) -> None:
    with _engine.connect() as conn:
        conn.execute(
            text("UPDATE submissions SET status = :s WHERE id = :id"),
            {"s": status, "id": submission_id},
        )
        conn.commit()


def _write_result(
    submission_id: str,
    verdict: str,
    output: str,
    time_ms: float,
) -> None:
    with _engine.connect() as conn:
        conn.execute(
            text("""
                UPDATE submissions
                SET status       = :verdict,
                    verdict      = :verdict,
                    output       = :output,
                    time_ms      = :time_ms,
                    completed_at = :completed_at
                WHERE id = :id
            """),
            {
                "id":           submission_id,
                "verdict":      verdict,
                "output":       output[:65_536],  # cap at 64 KB
                "time_ms":      time_ms,
                "completed_at": datetime.utcnow(),
            },
        )
        conn.commit()
