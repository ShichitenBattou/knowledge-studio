---
name: collect-copilot-feedback
description: >
  Use this skill to collect Copilot review feedback from past PRs and update the
  code-reviewer sub-agent's guidelines. Triggered by phrases like:
  「Copilotフィードバック集約」「レビュー観点の更新」「サブエージェントにCopilotフィードバックを反映」
  「Copilotレビューのフィードバックをサブエージェントに反映」
---

# Copilot フィードバック集約 Skill

過去PRのCopilotレビュー指摘を収集・整理して、`code-reviewer`サブエージェントの観点を更新するワークフロー。

## ステップ 1: スクリプトで収集

```bash
# 新規分のみ（通常）
uv run python scripts/collect_copilot_feedback.py

# 全件表示
uv run python scripts/collect_copilot_feedback.py --all

# Excelも出力
uv run --with pandas --with openpyxl python scripts/collect_copilot_feedback.py --excel
```

- 新規コメントは `docs/copilot-feedback/history.json` に追記される
- `severity` / `category` 列は空欄で出力される

## ステップ 2: Claude による分析・推奨

スクリプト出力のMarkdownテーブルを受け取ったら、各指摘について以下を付与して提示する:

- **重要度** (High / Medium / Low): コードの動作・安全性に影響するか、軽微なスタイル指摘かで判断
- **カテゴリ**: 下記から選択または新設
  - `バグ` / `パフォーマンス` / `セキュリティ` / `コードスタイル` / `アーキテクチャ` / `ドキュメント` / `テスト`
- **サブエージェント観点への推奨コメント**: この指摘から「次回どう防ぐか」を1行で記述

複数指摘に共通するパターンがある場合は、まとめて「横断的な観点」としてグルーピングして提示する。

## ステップ 3: 監理者が決定

推奨をもとに監理者が「サブエージェントに追加する観点」を決定する。
決定に際して `diff_hunk` が必要な場合は、コメントIDを使ってオンデマンドで取得する:

```bash
gh api repos/{owner}/{repo}/pulls/comments/{COMMENT_ID} --jq '.diff_hunk'
```

## ステップ 4: code-reviewer への書き込み

監理者の決定を `.claude/agent-memory/code-reviewer/` 配下のメモリファイルに追記する。
書き込み形式は既存メモリファイルを参照して揃えること。

## ステップ 5: history.json の更新

決定された指摘の `severity` / `category` を `docs/copilot-feedback/history.json` にも書き戻す。
次回スクリプト実行時に差分の基準として使用される。
