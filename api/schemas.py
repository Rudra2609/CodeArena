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


# ── Auth ───────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    is_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}

class VerifyOTP(BaseModel):
    email: str
    otp: str

class Token(BaseModel):
    access_token: str
    token_type: str

class ChangePassword(BaseModel):
    current_password: str
    new_password: str

# ── CodeFile ───────────────────────────────────────────────────

class CodeFileCreate(BaseModel):
    title: str
    language: str
    source_code: str

class CodeFileUpdate(BaseModel):
    title: Optional[str] = None
    language: Optional[str] = None
    source_code: Optional[str] = None

class CodeFileResponse(BaseModel):
    id: str
    user_id: str
    title: str
    language: str
    source_code: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
