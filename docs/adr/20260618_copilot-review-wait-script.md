# ADR: Copilotレビュー完了待機スクリプトの実装

- **Date**: 2026-06-18
- **Status**: Accepted
- **Issue**: #33

---

## Context

PR に Copilot レビューを依頼した後、Claude Code（AIエージェント）が「Copilot のレビューが完了したか」を判断する手段が自然言語の確認のみだと、毎回ポーリング間隔・終了条件・エラー処理の挙動にばらつきが出る。

本来実現したいのは以下の自律サイクルである：

```
PR作成 → Copilotレビュー依頼
  → [待機] Copilotレビュー完了を検知
  → レビューコメントを読んで修正 & commit & push
  → Copilotへ再レビュー依頼
  → [待機] Copilotレビュー完了を検知
  → ... （指摘がなくなるまで繰り返す）
```

この「待機」ステップをスクリプトで固定化し、Claude Code がスクリプトの終了を合図に自律的に次のアクション（レビューコメント取得 → 修正 → push → 再依頼）へ進むようにする。

Copilot は 1 回のレビューサイクルで複数回 `COMMENTED` を投稿するため、「レビュー完了」の判定が難しい。そのためスクリプト起動時点のレビュー件数をベースラインとして記録し、件数が増えた時点を「完了」とみなす（ベースラインカウント方式）。

## Alternatives Considered

ルールの配置先として以下を検討した（Discussion #32）:

| 案                                 | 評価                                        |
| ---------------------------------- | ------------------------------------------- |
| CLAUDE.md のワークフロー手順に記載 | Hotfix 等で手順を飛ばした場合は適用されない |
| Skill として実装                   | トークン消費が重い・オーバースペック        |
| CLAUDE.md に汎用ルールとして追記   | ワークフロー問わず常に適用される ← **採用** |

## Decision

### 完了検知：ベースラインカウント方式

スクリプト起動時点の Copilot レビュー件数 N を記録し、N+1 件以上になった時点で終了（exit 0）する。  
Claude Code はこのスクリプトを実行し、終了を待ってから次のアクションへ進む。

```
起動時: Copilotレビュー件数 = N件（前回分）
↓ ポーリング（30秒間隔）
件数が N+1 件以上になったらスクリプトを終了（exit 0）
↓ Claude Code が次のアクションへ進む（コメント取得 → 修正 → push → 再依頼）
```

### `scripts/wait_copilot_review.py` の実装

- `gh api` で PR のレビューリストを取得し、`user.login` が `"copilot-pull-request-reviewer[bot]"` であるレビューをカウント
- 起動時のカウントをベースラインとして保持
- 30 秒間隔でポーリング、経過時間と現在のカウントを出力して状況を可視化
- ベースライン + 1 以上になったら終了（`sys.exit(0)`）
- 実行コマンド: `uv run python scripts/wait_copilot_review.py <PR番号>`
- 標準ライブラリ + `subprocess`（gh CLI 呼び出し）のみで実装（`--with` 引数不要）

### CLAUDE.md への汎用ルール追記

`## ルール（厳守）` セクションに「Copilotレビューの自律対応サイクル」として追記する。  
ワークフロー手順ではなく汎用ルールとして置くことで、Hotfix 等あらゆる作業フローに適用される。

ルール内容:

1. Copilot レビューを依頼したら `uv run python scripts/wait_copilot_review.py <PR番号>` を実行してスクリプトが終了するまで待機する
2. スクリプト終了後、Claude Code は Copilot のレビューコメント（`gh pr view <PR番号> --comments` 等）を自律的に取得する
3. 指摘内容を修正・commit・push し、Copilot へ再レビューを依頼する
4. 再依頼後はスクリプトを再起動し、上記 1〜3 を指摘がなくなるまで繰り返す

## Consequences

### ポジティブ

- Claude Code が Copilot レビューサイクルを自律的・一貫したやり方で回せる
- ベースラインカウント方式により複数回のレビューサイクルにも対応できる
- CLAUDE.md の汎用ルールとして置くため、Hotfix 等あらゆるフローで適用される
- スクリプトの終了コードが次アクションへのシグナルになるため挙動がシンプル

### ネガティブ

- `gh api` が認証済みであることが前提（未認証環境では動作しない）
- Copilot がレビューを投稿しない場合（権限設定ミス等）はスクリプトが 30 分タイムアウトで終了し、自律サイクルが中断する

## Implementation Notes

- Copilot bot のログイン名は `"copilot-pull-request-reviewer[bot]"` を使用する
- `gh api repos/{owner}/{repo}/pulls/{pr_number}/reviews` でレビューリストを取得しフィルタリング
- タイムアウト設定（例: 30 分）を追加しておくと無限ポーリングを防げる（任意）
- Claude Code がコメントを取得する方法は `gh pr view <PR番号> --json reviews` や `gh api` で取得する
- スクリプト終了後に Claude Code がコメントを読む手順は CLAUDE.md のルールとして明記する
