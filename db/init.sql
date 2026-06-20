-- init.sql — Schema creation + seed problems
-- Runs automatically on first postgres container start

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS problems (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title           TEXT NOT NULL,
    description     TEXT,
    stdin_example   TEXT,
    expected_output TEXT,
    difficulty      TEXT DEFAULT 'medium',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    username        TEXT UNIQUE NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    is_verified     BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS submissions (
    id              TEXT PRIMARY KEY,
    problem_id      TEXT REFERENCES problems(id) ON DELETE SET NULL,
    language        TEXT NOT NULL,
    source_code     TEXT NOT NULL,
    expected_output TEXT,
    status          TEXT NOT NULL DEFAULT 'PENDING',
    verdict         TEXT,
    output          TEXT,
    time_ms         FLOAT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_status  ON submissions (status);

