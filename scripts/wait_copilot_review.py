"""
Wait for GitHub Copilot to post a new review on a PR.

Usage:
    uv run python scripts/wait_copilot_review.py <PR_NUMBER>

Exits 0 when a new Copilot review is detected (baseline count + 1 or more).
Exits 1 on error (missing argument, gh CLI failure, timeout).
"""

import json
import subprocess
import sys
import time

COPILOT_LOGIN = "copilot-pull-request-reviewer[bot]"
POLL_INTERVAL = 30
TIMEOUT_SECONDS = 30 * 60  # 30 minutes


def get_copilot_review_count(pr_number: int) -> int:
    result = subprocess.run(
        ["gh", "api", f"repos/{{owner}}/{{repo}}/pulls/{pr_number}/reviews"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"[error] gh api failed: {result.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    reviews = json.loads(result.stdout)
    return sum(1 for r in reviews if r.get("user", {}).get("login") == COPILOT_LOGIN)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: uv run python scripts/wait_copilot_review.py <PR_NUMBER>", file=sys.stderr)
        sys.exit(1)

    pr_number = int(sys.argv[1])
    baseline = get_copilot_review_count(pr_number)
    print(f"[wait_copilot_review] PR #{pr_number} — baseline Copilot reviews: {baseline}")
    print(f"[wait_copilot_review] Polling every {POLL_INTERVAL}s (timeout: {TIMEOUT_SECONDS // 60}min)...")

    start = time.time()
    while True:
        elapsed = int(time.time() - start)
        if elapsed >= TIMEOUT_SECONDS:
            print("[wait_copilot_review] Timeout reached. Copilot review not detected.", file=sys.stderr)
            sys.exit(1)

        time.sleep(POLL_INTERVAL)
        elapsed = int(time.time() - start)
        count = get_copilot_review_count(pr_number)
        print(f"[wait_copilot_review] {elapsed}s elapsed — Copilot reviews: {count} (baseline: {baseline})")

        if count > baseline:
            print(f"[wait_copilot_review] ✅ New Copilot review detected! (total: {count})")
            sys.exit(0)


if __name__ == "__main__":
    main()
