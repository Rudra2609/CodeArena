"""
celery_app.py — Celery application configuration
"""

import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "judge_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["worker.tasks"],
)

celery_app.conf.update(
    task_serializer          = "json",
    result_serializer        = "json",
    accept_content           = ["json"],
    task_acks_late           = True,   # re-queue if worker crashes mid-task
    task_reject_on_worker_lost = True,
    worker_prefetch_multiplier = 1,    # one task at a time per worker
    result_expires           = 3600,   # keep results in Redis for 1 hour
    timezone                 = "UTC",
)
