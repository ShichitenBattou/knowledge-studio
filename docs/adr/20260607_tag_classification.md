# ADR: タグ/分類機能の実装

- **Date**: 2026-06-07
- **Status**: Accepted
- **Issue**: #5 タグ/分類

---

## Context

Issue #4「ナレッジ登録」が完了し、`notes` テーブルへのCRUD操作が実装された。現状ではナレッジを意味的に整理する手段がなく、件数が増えるにつれ目的のナレッジを探すのが困難になる。

タグ機能を追加することで以下が実現できる：

- 登録済みナレッジを用途・カテゴリ別に整理できる
- フィルタリングにより表示件数を絞り込める
- Issue #6（ベクトル検索）との組み合わせで、タグ × 意味検索の複合フィルタが可能になる
- Issue #15（職務経歴書生成）で「職務経歴書カテゴリ」のタグ絞り込みが必要になる

## Decision

### スキーマ設計

`tags` テーブルと `note_tags` 中間テーブルを追加し、`notes` とタグを多対多で管理する。

```sql
CREATE TABLE IF NOT EXISTS tags (
    id   UUID PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id  UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);
```

`initializeKnowledgeDB()` に上記CREATE文を追加する（既存テーブルはそのまま）。

### UI設計

#### ナレッジ一覧ページ（`app/pages/knowledge/index.vue`）

1. **タグフィルタバー**：登録済みタグをチップ状で表示し、クリックで絞り込み（複数選択AND）。「すべて」チップで解除。
2. **ナレッジカード**：各ナレッジに付与済みタグをチップで表示。
3. **登録フォーム**：テキスト入力に加えてタグ入力欄を追加。自由入力（Enterで追加）＋既存タグからのサジェスト。
4. **編集モーダル**：既存タグを表示・追加・削除できる。

#### タグ管理

- タグはナレッジに付与された時点で `tags` テーブルに自動作成（`INSERT ... ON CONFLICT DO NOTHING`）。
- タグ削除機能はナレッジ一覧の「タグ管理」モーダルで提供（タグ名右の×ボタン）。削除時は `note_tags` の関連レコードも CASCADE で自動削除。

### データアクセス

- `db.live.query()` を活用し、タグ一覧・フィルタ結果ともにリアクティブに更新する。
- フィルタ時のクエリ例（選択タグ数に応じて動的生成）：

```sql
SELECT DISTINCT n.id, n.note, n.created_at,
       COALESCE(array_agg(t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
FROM notes n
LEFT JOIN note_tags nt ON n.id = nt.note_id
LEFT JOIN tags t       ON nt.tag_id = t.id
WHERE nt.tag_id IN ($1, $2, ...)  -- フィルタ選択時のみ
GROUP BY n.id, n.note, n.created_at
ORDER BY n.created_at DESC NULLS LAST
```

## Consequences

### ポジティブ

- ナレッジが増えても目的のものをタグで素早く絞り込める
- 多対多設計により、1つのナレッジに複数タグを柔軟に付与できる
- Issue #6（ベクトル検索）との組み合わせが容易（WHERE句の追加のみ）
- Issue #15（職務経歴書生成）での「職務経歴書」タグ絞り込みに対応できる
- `ON DELETE CASCADE` により孤立レコードが発生しない

### ネガティブ

- スキーマ変更が必要（既存ユーザーは再マイグレーション不要、`IF NOT EXISTS` で対応）
- 既存のナレッジはタグなしで移行される
- フィルタクエリが複雑になるため、件数が増えた際のクエリパフォーマンス低下の可能性がある（ただしブラウザ内DBのためデータ量に上限がある）

## Alternatives Considered

### A. `notes` テーブルにタグカラム（テキスト配列）を直接追加

`tags TEXT[]` カラムを追加する案。PGliteのpg_arrayで検索は可能だが、タグの一覧取得・削除・リネームが難しくなるため却下。

### B. タグをJSON文字列として保存

スキーマ変更不要だが、型安全性がなく検索・集計が困難になるため却下。

## Implementation Notes

- タグ入力UIは `UBadge` + `UInput` の組み合わせで実装する（Nuxt UI v4）
- タグ名のバリデーション：空文字・重複を排除、先頭末尾の空白はtrim
- タグサジェストは `tags` テーブルの全件取得（`SELECT id, name FROM tags ORDER BY name`）をリアクティブに保持し、入力文字で前方一致フィルタ
- `note_tags` の更新は「ナレッジ保存時に全削除→再挿入」方式で実装（差分検出より単純で安全）
