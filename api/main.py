"""
CodeArena  —  API service

Endpoints
  POST   /api/submit                 Create submission, enqueue for execution
  GET    /api/submissions/{id}       Poll submission status / result
  GET    /api/submissions            List recent submissions (last 50)
  GET    /api/problems               List all problems
  GET    /api/problems/{id}          Get single problem
  GET    /health                     Liveness probe
"""

import uuid
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db, engine
from models import Base, Submission, Problem, CodeFile, User
from schemas import SubmissionCreate, SubmissionResponse, ProblemResponse, CodeFileCreate, CodeFileUpdate, CodeFileResponse
from auth import get_current_user
from celery_client import enqueue_submission


# ── Startup / shutdown ────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables if they don't exist yet (idempotent)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


# ── App ────────────────────────────────────────────────────────
app = FastAPI(
    title="Code Judge API",
    description="Online code judge with sandboxed Docker execution",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)


from auth import router as auth_router

app.include_router(auth_router)

# ── Submissions ────────────────────────────────────────────────

@app.post("/api/submit", response_model=SubmissionResponse, status_code=201)
async def create_submission(
    body: SubmissionCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Accept a code submission, persist it as PENDING, and enqueue
    it for execution by the Celery worker.
    """
    # If a problem_id is provided, look up its expected output
    expected_output = body.expected_output or ""
    stdin = body.stdin or ""

    if body.problem_id:
        result = await db.execute(
            select(Problem).where(Problem.id == body.problem_id)
        )
        problem = result.scalar_one_or_none()
        if not problem:
            raise HTTPException(status_code=404, detail="Problem not found")
        if not expected_output:
            expected_output = problem.expected_output or ""
        if not stdin:
            stdin = problem.stdin_example or ""

    submission = Submission(
        id=str(uuid.uuid4()),
        problem_id=body.problem_id,
        language=body.language,
        source_code=body.source_code,
        expected_output=expected_output,
        status="PENDING",
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    # Enqueue asynchronously — worker picks it up from Redis
    enqueue_submission(
        submission_id=submission.id,
        language=body.language,
        source_code=body.source_code,
        stdin=stdin,
        expected_output=expected_output,
    )

    return submission


@app.get("/api/submissions/{submission_id}", response_model=SubmissionResponse)
async def get_submission(
    submission_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission


@app.get("/api/submissions", response_model=List[SubmissionResponse])
async def list_submissions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Submission).order_by(Submission.created_at.desc()).limit(50)
    )
    return result.scalars().all()


# ── Problems ───────────────────────────────────────────────────

@app.get("/api/problems", response_model=List[ProblemResponse])
async def list_problems(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Problem).order_by(Problem.created_at)
    )
    return result.scalars().all()


@app.get("/api/problems/{problem_id}", response_model=ProblemResponse)
async def get_problem(
    problem_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Problem).where(Problem.id == problem_id)
    )
    problem = result.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    return problem


# ── Health ─────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Code Files ─────────────────────────────────────────────────

@app.get("/api/files", response_model=List[CodeFileResponse])
async def list_files(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CodeFile).where(CodeFile.user_id == current_user.id).order_by(CodeFile.updated_at.desc())
    )
    return result.scalars().all()

@app.post("/api/files", response_model=CodeFileResponse, status_code=201)
async def create_file(
    body: CodeFileCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    new_file = CodeFile(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=body.title,
        language=body.language,
        source_code=body.source_code,
    )
    db.add(new_file)
    await db.commit()
    await db.refresh(new_file)
    return new_file

@app.get("/api/files/{file_id}", response_model=CodeFileResponse)
async def get_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CodeFile).where(CodeFile.id == file_id, CodeFile.user_id == current_user.id)
    )
    code_file = result.scalar_one_or_none()
    if not code_file:
        raise HTTPException(status_code=404, detail="File not found")
    return code_file

@app.put("/api/files/{file_id}", response_model=CodeFileResponse)
async def update_file(
    file_id: str,
    body: CodeFileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CodeFile).where(CodeFile.id == file_id, CodeFile.user_id == current_user.id)
    )
    code_file = result.scalar_one_or_none()
    if not code_file:
        raise HTTPException(status_code=404, detail="File not found")

    if body.title is not None:
        code_file.title = body.title
    if body.language is not None:
        code_file.language = body.language
    if body.source_code is not None:
        code_file.source_code = body.source_code

    await db.commit()
    await db.refresh(code_file)
    return code_file

@app.delete("/api/files/{file_id}", status_code=204)
async def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CodeFile).where(CodeFile.id == file_id, CodeFile.user_id == current_user.id)
    )
    code_file = result.scalar_one_or_none()
    if not code_file:
        raise HTTPException(status_code=404, detail="File not found")

    await db.delete(code_file)
    await db.commit()
    return None
