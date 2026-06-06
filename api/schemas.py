"""
schemas.py — Pydantic request / response schemas
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


# ── Problem ────────────────────────────────────────────────────

class ProblemResponse(BaseModel):
    id:              str
    title:           str
    description:     Optional[str]
    stdin_example:   Optional[str]
    expected_output: Optional[str]
    difficulty:      Optional[str]
    created_at:      datetime

    model_config = {"from_attributes": True}


# ── Submission ─────────────────────────────────────────────────

class SubmissionCreate(BaseModel):
    language:        str                  # python | cpp | java | javascript
    source_code:     str
    stdin:           Optional[str] = ""
    expected_output: Optional[str] = ""
    problem_id:      Optional[str] = None


class SubmissionResponse(BaseModel):
    id:              str
    problem_id:      Optional[str]
    language:        str
    source_code:     str
    status:          str
    verdict:         Optional[str]
    output:          Optional[str]
    time_ms:         Optional[float]
    created_at:      datetime
    completed_at:    Optional[datetime]

    model_config = {"from_attributes": True}
