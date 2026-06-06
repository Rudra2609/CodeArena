"""
judge.py  —  Verdict evaluation

Takes the raw execution result from executor.py and the expected output,
and determines the final verdict the user sees.

Verdict codes
─────────────
AC   Accepted             — output matches expected (after normalisation)
WA   Wrong Answer         — output does not match
TLE  Time Limit Exceeded  — execution timed out
MLE  Memory Limit Exceeded
RE   Runtime Error        — non-zero exit code
CE   Compilation Error    — compile step failed
OK   Executed (no expected output to compare against)
ERR  Internal error
"""


def evaluate_verdict(
    execution_result: dict,
    expected_output: str,
) -> str:
    """
    Map an execution result to a final verdict string.

    Parameters
    ----------
    execution_result : dict
        Returned by executor.execute_code()
        Keys: verdict, output, time_ms
    expected_output : str
        The correct answer for the problem.
        Empty string or None means "no comparison" → return OK if ran.
    """
    base = execution_result.get("verdict", "ERR")

    # These verdicts are independent of output comparison
    if base in ("CE", "RE", "TLE", "MLE", "ERR"):
        return base

    # No expected output → just report whether it ran
    if not expected_output or not expected_output.strip():
        return "OK"

    actual   = _normalise(execution_result.get("output", ""))
    expected = _normalise(expected_output)

    return "AC" if actual == expected else "WA"


def _normalise(s: str) -> str:
    """
    Normalise output for comparison:
      - Strip trailing whitespace from every line
      - Remove trailing blank lines
      - Collapse to lowercase? No — judges are case-sensitive

    This mirrors the normalisation used by most competitive programming judges.
    """
    lines = [line.rstrip() for line in s.strip().splitlines()]
    return "\n".join(lines)
