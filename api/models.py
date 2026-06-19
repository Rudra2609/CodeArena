"""
models.py — SQLAlchemy ORM models
"""

from datetime import datetime
from sqlalchemy import Column, String, Text, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id              = Column(String, primary_key=True)
    username        = Column(String, unique=True, index=True, nullable=False)
    email           = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_verified     = Column(Boolean, default=False)
    created_at      = Column(DateTime, default=datetime.utcnow)


class Problem(Base):
    __tablename__ = "problems"

    id              = Column(String, primary_key=True)
    title           = Column(String, nullable=False)
    description     = Column(Text, nullable=True)
    stdin_example   = Column(Text, nullable=True)
    expected_output = Column(Text, nullable=True)
    difficulty      = Column(String, default="medium")   # easy | medium | hard
    created_at      = Column(DateTime, default=datetime.utcnow)


class Submission(Base):
    __tablename__ = "submissions"

    id              = Column(String, primary_key=True)
    problem_id      = Column(String, ForeignKey("problems.id"), nullable=True)
    language        = Column(String, nullable=False)
    source_code     = Column(Text, nullable=False)
    expected_output = Column(Text, nullable=True)
    status          = Column(String, default="PENDING")   # PENDING | RUNNING | AC | WA | TLE | MLE | RE | CE | ERR
    verdict         = Column(String, nullable=True)
    output          = Column(Text, nullable=True)
    time_ms         = Column(Float, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    completed_at    = Column(DateTime, nullable=True)


class CodeFile(Base):
    __tablename__ = "code_files"

    id              = Column(String, primary_key=True)
    user_id         = Column(String, ForeignKey("users.id"), nullable=False)
    title           = Column(String, nullable=False)
    language        = Column(String, nullable=False)
    source_code     = Column(Text, nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
