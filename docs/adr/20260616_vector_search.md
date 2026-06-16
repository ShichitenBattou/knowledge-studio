# ADR: ベクトル検索

- **Date**: 2026-06-16
- **Status**: Accepted
- **Issue**: #6 ベクトル検索

---

## Context

Issue #4（ナレッジ登録）で `notes` テーブルに384次元の埋め込みベクトルを保存するスキーマとinsert処理が実装済みである。Issue #5（タグ/分類）ではタグによるフィルタ機能が実装された。現時点でナレッジの閲覧は登録順の全件表示のみで、「意味的に近いナレッジを探す」手段がない。

pgvector 拡張はすでに有効化されており（`db.ts` の初期化処理参照）、コサイン距離演算子 `<=>` を使えばベクトル類似度検索を SQL で実行できる。

## Decision

### `searchNotes` 関数を `useKnowledge.ts` に追加する

シグネチャ:

```typescript
async function searchNotes(
  query: string,
  topK: number = 5,
  filterTagNames: string[] = [],
): Promise<SearchResult[]>
```

- `generateEmbedding(query)` でクエリを384次元ベクトルへ変換する（既存の `useEmbedding` を再利用）
- pgvector の `<=>` 演算子（コサイン距離）で類似度検索を行う
- 結果は `1 - distance` を `similarity` として返し、`distance ASC`（＝類似度降順）でソートする
- `topK` 件に限定して返す（デフォルト 5）
- `filterTagNames` が空でない場合は、指定タグを1つ以上持つノートのみ対象とする

### SQL 設計

**タグフィルタなし:**

```sql
WITH ranked_notes AS (
  SELECT
    n.id, n.note, n.created_at,
    COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags,
    (n.embedding <=> $1::vector) AS distance
  FROM notes n
  LEFT JOIN note_tags nt ON n.id = nt.note_id
  LEFT JOIN tags t ON nt.tag_id = t.id
  GROUP BY n.id, n.note, n.created_at, n.embedding
)
SELECT id, note, created_at, tags, (1 - distance) AS similarity
FROM ranked_notes
ORDER BY distance ASC
LIMIT $2
```

**タグフィルタあり (`$3` = タグ名の配列):**

```sql
WITH ranked_notes AS (
  SELECT
    n.id, n.note, n.created_at,
    COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags,
    (n.embedding <=> $1::vector) AS distance
  FROM notes n
  LEFT JOIN note_tags nt ON n.id = nt.note_id
  LEFT JOIN tags t ON nt.tag_id = t.id
  GROUP BY n.id, n.note, n.created_at, n.embedding
  HAVING bool_or(t.name = ANY($3::text[]))
)
SELECT id, note, created_at, tags, (1 - distance) AS similarity
FROM ranked_notes
ORDER BY distance ASC
LIMIT $2
```

タグフィルタのセマンティクスは **OR**（指定タグのうち1つ以上を持つノートを返す）とする。

### 検索中の並行実行防止

`isSearching` ref を `useKnowledge` 内に追加し、検索中は再実行をスキップする。

### `SearchResult` インターフェース

```typescript
interface SearchResult {
  id: string
  note: string
  created_at: string
  tags: string[]
  similarity: number
}
```

### UI 設計

`app/pages/knowledge/index.vue` に検索セクションを追加する。配置はナレッジ追加フォームとナレッジ一覧の間。

**表示条件**: `import.meta.dev` が `true` の場合（開発モード）のみ表示する。Nuxt のビルド時に静的解析されるため、本番バンドルには検索 UI が含まれない。精度がまだ一般ユーザー向けでないため、開発・評価目的に限定する。

- テキスト入力（クエリ）
- top-k 数値入力（デフォルト 5、最小 1・最大 20）
- タグフィルタ（`allTags` を選択肢とする複数選択）
- 検索ボタン（検索中はローディング表示）
- 検索結果リスト（類似度スコア付き）
- 検索をリセットするボタン

### テスト追加

`app/composables/useKnowledge.test.ts` に `searchNotes` の以下テストケースを追加する：

- クエリから埋め込みを生成して DB に渡す（基本ケース）
- `topK` をデフォルト（5）と任意値（3）で呼び出す
- `filterTagNames` を渡した場合は HAVING 句付き SQL を使用する
- 検索中（`isSearching = true`）の再呼び出しは空配列を返す

## Consequences

### ポジティブ

- 意味的な類似度でナレッジを発見できるようになる（キーワード一致不要）
- 既存の pgvector・Transformers.js の基盤を追加インフラなしで流用できる
- タグフィルタと組み合わせることで検索精度を絞り込める

### ネガティブ

- 埋め込み生成はブラウザ内 ML 推論のため初回クエリに数秒かかる可能性がある
- 全件コサイン距離を計算するため、ナレッジ件数が多い場合にパフォーマンスが低下する（ブラウザ内 WASM のスケール上限は数千件程度と想定）

## Implementation Notes

- `isSearching` は `useKnowledge` の内部 state とし、外部へは `ref` のまま expose する
- タグフィルタの SQL 分岐は if/else で明示的に分け、動的 SQL 文字列結合は使わない
- 類似度スコアは小数点2桁表示（例: `0.85`）で UI に表示する
