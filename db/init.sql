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

-- ── Seed problems ─────────────────────────────────────────────

INSERT INTO problems (id, title, description, stdin_example, expected_output, difficulty)
VALUES
(
  'p-hello-world',
  'Hello World',
  'Print "Hello, World!" to stdout.',
  '',
  'Hello, World!',
  'easy'
),
(
  'p-sum-two',
  'Sum of Two Numbers',
  'Read two integers from stdin separated by a newline. Print their sum.',
  '3\n5',
  '8',
  'easy'
),
(
  'p-fibonacci',
  'Fibonacci Number',
  'Given n (1 ≤ n ≤ 30), print the n-th Fibonacci number (1-indexed, starting 1 1 2 3 5…).',
  '7',
  '13',
  'easy'
),
(
  'p-palindrome',
  'Palindrome Check',
  'Read a single word. Print "YES" if it is a palindrome, "NO" otherwise.',
  'racecar',
  'YES',
  'easy'
),
(
  'p-reverse',
  'Reverse a String',
  'Read a single line and print it reversed.',
  'hello',
  'olleh',
  'easy'
),
(
  'p-two-sum',
  'Two Sum (sorted)',
  'Given n numbers on the first line and a target T on the second line, print the 1-based indices (i j, i<j) of the two numbers that sum to T. Guaranteed unique solution.',
  '4\n2 7 11 15\n9',
  '1 2',
  'medium'
),
(
  'p-word-count',
  'Word Frequency',
  'Read lines of text until EOF. Print each unique word and its count, sorted alphabetically, one per line as "word count".',
  'the cat sat\nthe cat',
  'cat 2\nsat 1\nthe 2',
  'medium'
)
ON CONFLICT (id) DO NOTHING;
