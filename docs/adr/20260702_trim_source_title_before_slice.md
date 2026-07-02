# ADR: 出典タイトルの先頭30文字スライス前にトリム処理を追加する

- **Date**: 2026-07-02
- **Status**: Proposed
- **Issue**: #35

---

## Context

`app/pages/rag/index.vue` の出典表示（`source.note.slice(0, 30)`）は、ノート本文をトリムせずに先頭30文字を切り出している。ノート先頭が改行や空白で始まる場合、出典タイトルが空白や空に見えるケースがある。

Copilot レビュー（PR #30, thread `PRRT_kwDOSwcNM86KHASB`）で指摘された内容で、RAG機能本体（Issue #7/#8）の実装とは独立した改善のため、別Issueとして切り出されたもの。

## Decision

`source.note.slice(0, 30)` および文字数判定を、先頭に `.trim()` を挟む形に変更する。

```vue
{{ source.note.trim().slice(0, 30) }}{{ source.note.trim().length > 30 ? '...' : '' }}
```

## Consequences

### ポジティブ

- ノート先頭が空白・改行のみのケースでも意味のある出典タイトルが表示される

### ネガティブ

- 特になし（表示ロジックのみの変更）

## Implementation Notes

- 変更箇所は `app/pages/rag/index.vue` の出典タイトル表示部分のみ
- `trim()` の呼び出しが2箇所（スライスと文字数判定）に増えるが、テンプレート内の単純な表示ロジックのため許容する
