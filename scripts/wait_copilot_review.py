"""
Wait for GitHub Copilot to post a new review on a PR.

Usage:
    uv run python scripts/wait_copilot_review.py <PR_NUMBER>

Exits 0 when a new Copilot review is detected (baseline count + 1 or more).
Exits 1 on error (missing argument, gh CLI failure, timeout).
"""

import json
import os
import subprocess
import sys
import time

COPILOT_LOGIN = "copilot-pull-request-reviewer[bot]"
POLL_INTERVAL = 30
TIMEOUT_SECONDS = 30 * 60  # 30 minutes
GH_TIMEOUT = 60  # seconds before giving up on a single gh api call

# Resolve repo root from this script's location (scripts/ → repo root)
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_copilot_review_count(pr_number: int) -> int:
    # --paginate fetches all pages; --slurp merges them into an array of arrays
    try:
        result = subprocess.run(
            ["gh", "api", "--paginate", "--slurp", f"repos/{{owner}}/{{repo}}/pulls/{pr_number}/reviews"],
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
            timeout=GH_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        print(f"[error] gh api timed out after {GH_TIMEOUT}s", file=sys.stderr)
        sys.exit(1)
    if result.returncode != 0:
        print(f"[error] gh api failed: {result.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    try:
        pages = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        print(f"[error] Failed to parse JSON response: {e}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(pages, list):
        print(f"[error] Unexpected response format: {result.stdout[:200]}", file=sys.stderr)
        sys.exit(1)
    # Flatten pages (each page is a list of reviews)
    reviews = [r for page in pages for r in (page if isinstance(page, list) else [])]
    return sum(1 for r in reviews if r.get("user", {}).get("login") == COPILOT_LOGIN)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: uv run python scripts/wait_copilot_review.py <PR_NUMBER>", file=sys.stderr)
        sys.exit(1)

    try:
        pr_number = int(sys.argv[1].lstrip("#"))
    except ValueError:
        print(f"[error] Invalid PR number: {sys.argv[1]!r}", file=sys.stderr)
        sys.exit(1)

    baseline = get_copilot_review_count(pr_number)
    print(f"[wait_copilot_review] PR #{pr_number} — baseline Copilot reviews: {baseline}")
    print(f"[wait_copilot_review] Polling every {POLL_INTERVAL}s (timeout: {TIMEOUT_SECONDS // 60}min)...")

    start = time.monotonic()
    while True:
        time.sleep(POLL_INTERVAL)
        elapsed = int(time.monotonic() - start)

        if elapsed >= TIMEOUT_SECONDS:
            print("[wait_copilot_review] Timeout reached. Copilot review not detected.", file=sys.stderr)
            sys.exit(1)

        count = get_copilot_review_count(pr_number)
        print(f"[wait_copilot_review] {elapsed}s elapsed — Copilot reviews: {count} (baseline: {baseline})")

        if count > baseline:
            print(f"[wait_copilot_review] New Copilot review detected! (total: {count})")
            sys.exit(0)


if __name__ == "__main__":
    main()
