---
name: feedback-branch-naming
description: gh issue develop でブランチ名に日本語が入るとGitHubが警告するため、英語ブランチ名を明示指定すること
metadata:
  type: feedback
---

`gh issue develop <N> --checkout` はIssueタイトルからブランチ名を自動生成するが、日本語タイトルのIssueでは日本語ブランチ名（例: `4-ナレッジ登録`）になりGitHubが "hidden character" 警告を出す。

**Why:** GitHub はUnicode文字を含むブランチ名をhead refの "hidden characters" として警告する。機能的な問題はないが警告が出るため避けたい。

**How to apply:** Issueからブランチを作る際は常に `--branch` オプションで英語名を明示する。

```bash
gh issue develop <N> --branch "<N>-short-english-name" --checkout
```
