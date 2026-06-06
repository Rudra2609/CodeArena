"""
celery_client.py — Thin Celery task dispatcher used by the API service.

The API process does not import the full worker package; it only sends
a task message to Redis using Celery's send_task() shortcut.
"""

import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

_celery = Celery(broker=REDIS_URL, backend=REDIS_URL)


def enqueue_submission(
    submission_id:   str,
    language:        str,
    source_code:     str,
    stdin:           str = "",
    expected_output: str = "",
) -> None:
    """Push an execute_submission task onto the Redis queue."""
    _celery.send_task(
        "worker.tasks.execute_submission",
        kwargs={
            "submission_id":   submission_id,
            "language":        language,
            "source_code":     source_code,
            "stdin":           stdin,
            "expected_output": expected_output,
        },
    )
