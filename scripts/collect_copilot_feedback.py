"""
Collect GitHub Copilot review comments from all PRs and output as Markdown table.

Usage:
    uv run python scripts/collect_copilot_feedback.py [--excel] [--all]

Options:
    --excel  Also generate an Excel file (requires pandas and openpyxl)
    --all    Show all collected comments (default: only new since last run)

History:  .claude/copilot-feedback/history.json  (updated on each run)
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone

COPILOT_AUTHOR = "copilot-pull-request-reviewer"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HISTORY_FILE = os.path.join(REPO_ROOT, "docs", "copilot-feedback", "history.json")
GH_TIMEOUT = 60


# ---------------------------------------------------------------------------
# gh helpers
# ---------------------------------------------------------------------------

def _run_gh(args: list[str]) -> object:
    try:
        result = subprocess.run(
            ["gh"] + args,
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
            timeout=GH_TIMEOUT,
        )
    except FileNotFoundError:
        print("[error] 'gh' command not found. Install the GitHub CLI and ensure it is in PATH.", file=sys.stderr)
        sys.exit(1)
    except subprocess.TimeoutExpired:
        print(f"[error] gh timed out after {GH_TIMEOUT}s", file=sys.stderr)
        sys.exit(1)
    if result.returncode != 0:
        print(f"[error] gh failed: {result.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    return json.loads(result.stdout)


def _graphql(query: str) -> dict:
    return _run_gh(["api", "graphql", "-f", f"query={query}"])


# ---------------------------------------------------------------------------
# Data collection
# ---------------------------------------------------------------------------

def get_repo_info() -> tuple[str, str]:
    data = _run_gh(["repo", "view", "--json", "owner,name"])
    return data["owner"]["login"], data["name"]


def fetch_all_copilot_comments(owner: str, name: str) -> list[dict]:
    """Fetch all Copilot inline review comments across all PRs using GraphQL."""
    comments: list[dict] = []
    pr_cursor: str | None = None

    while True:
        after = f', after: "{pr_cursor}"' if pr_cursor else ""
        query = f"""
        {{
          repository(owner: "{owner}", name: "{name}") {{
            pullRequests(first: 50, states: [OPEN, CLOSED, MERGED]{after}) {{
              pageInfo {{ hasNextPage endCursor }}
              nodes {{
                number
                title
                reviewThreads(first: 100) {{
                  nodes {{
                    isResolved
                    comments(first: 20) {{
                      nodes {{
                        fullDatabaseId
                        body
                        path
                        createdAt
                        url
                        author {{ login }}
                      }}
                    }}
                  }}
                }}
              }}
            }}
          }}
        }}
        """
        data = _graphql(query)
        pr_page = data["data"]["repository"]["pullRequests"]

        for pr in pr_page["nodes"]:
            for thread in pr["reviewThreads"]["nodes"]:
                is_resolved = thread["isResolved"]
                for comment in thread["comments"]["nodes"]:
                    author_login = (comment["author"] or {}).get("login", "")
                    if COPILOT_AUTHOR not in author_login:
                        continue
                    comments.append({
                        "id": int(comment["fullDatabaseId"]),
                        "pr_number": pr["number"],
                        "pr_title": pr["title"],
                        "path": comment["path"] or "",
                        "body": comment["body"],
                        "created_at": comment["createdAt"],
                        "url": comment["url"],
                        "is_resolved": is_resolved,
                        "severity": "",
                        "category": "",
                    })

        if not pr_page["pageInfo"]["hasNextPage"]:
            break
        pr_cursor = pr_page["pageInfo"]["endCursor"]

    return comments


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def load_history() -> dict:
    if not os.path.exists(HISTORY_FILE):
        return {"comments": [], "last_run": None}
    with open(HISTORY_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_history(comments: list[dict]) -> None:
    os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(
            {"comments": comments, "last_run": datetime.now(timezone.utc).isoformat()},
            f,
            ensure_ascii=False,
            indent=2,
        )


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def _truncate(text: str, n: int) -> str:
    text = text.replace("\n", " ").replace("|", "｜")
    return text[:n] + "..." if len(text) > n else text


def to_markdown(comments: list[dict], is_diff: bool) -> str:
    if not comments:
        label = "新規コメントはありません。" if is_diff else "コメントがありません。"
        return f"{label}\n"

    heading = "## 新規Copilotレビュー指摘一覧\n\n" if is_diff else "## Copilotレビュー指摘一覧（全件）\n\n"
    lines = [
        "| ID | PR | ファイル | コメント概要 | 日付 | リンク | 解決済 | 重要度 | カテゴリ |",
        "|---|---|---|---|---|---|:---:|---|---|",
    ]
    for c in sorted(comments, key=lambda x: x["created_at"]):
        lines.append(
            "| {id} | #{pr_number} {pr_title} | `{path}` | {body} | {date} | [→]({url}) | {resolved} |  |  |".format(
                id=c["id"],
                pr_number=c["pr_number"],
                pr_title=_truncate(c["pr_title"], 20),
                path=c["path"],
                body=_truncate(c["body"], 80),
                date=c["created_at"][:10],
                url=c["url"],
                resolved="✓" if c["is_resolved"] else "",
            )
        )
    return heading + "\n".join(lines) + "\n"


def to_excel(comments: list[dict], path: str) -> None:
    try:
        import pandas as pd  # noqa: PLC0415
    except ImportError:
        print(
            "[error] Excel出力には pandas と openpyxl が必要です:\n"
            "  uv run --with pandas --with openpyxl python scripts/collect_copilot_feedback.py --excel",
            file=sys.stderr,
        )
        sys.exit(1)

    df = pd.DataFrame(
        [
            {
                "ID": c["id"],
                "PR番号": c["pr_number"],
                "PRタイトル": c["pr_title"],
                "ファイル": c["path"],
                "コメント": c["body"],
                "作成日時": c["created_at"],
                "URL": c["url"],
                "解決済": c["is_resolved"],
                "重要度": c["severity"],
                "カテゴリ": c["category"],
            }
            for c in sorted(comments, key=lambda x: x["created_at"])
        ]
    )
    df.to_excel(path, index=False)
    print(f"[collect] Excelファイル: {path}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    args = sys.argv[1:]
    do_excel = "--excel" in args
    show_all = "--all" in args

    print("[collect] リポジトリ情報を取得中...", file=sys.stderr)
    owner, name = get_repo_info()

    print(f"[collect] {owner}/{name} の全PRからCopilotコメントを収集中...", file=sys.stderr)
    fetched = fetch_all_copilot_comments(owner, name)

    history = load_history()
    known_ids = {c["id"] for c in history["comments"]}
    new_comments = [c for c in fetched if c["id"] not in known_ids]

    # Merge: carry over manually-set severity/category from history, refresh is_resolved
    by_id = {c["id"]: c for c in history["comments"]}
    for c in fetched:
        prev = by_id.get(c["id"], {})
        by_id[c["id"]] = {**c, "severity": prev.get("severity", ""), "category": prev.get("category", "")}
    merged = list(by_id.values())

    save_history(merged)
    print(f"[collect] 全{len(fetched)}件 / 新規{len(new_comments)}件", file=sys.stderr)

    display = merged if show_all else new_comments
    print(to_markdown(display, is_diff=not show_all))

    if do_excel:
        excel_path = os.path.join(os.path.dirname(HISTORY_FILE), "feedback.xlsx")
        to_excel(display, excel_path)


if __name__ == "__main__":
    main()
