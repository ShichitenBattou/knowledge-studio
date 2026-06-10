# ADR: ベクトル検索

- **Date**: 2026-06-10
- **Status**: Proposed
- **Issue**: #6 ベクトル検索

---

## Context

Issue #4（ナレッジ登録）により `notes` テーブルには `embedding vector(384)` カラムが存在し、ナレッジ登録時に Transformers.js（`Xenova/all-MiniLM-L6-V2`）で生成した384次元の埋め込みが保存される。また `pgvector` 拡張が有効になっており、コサイン類似度検索のための演算子 `<=>` が使える状態にある。

現時点ではナレッジの一覧表示（全件取得）のみが実装されており、意味的類似度による検索機能は存在しない。

## Decision

### アーキテクチャ方針

既存の `useKnowledge` composable に `searchNotes` 関数を追加する（新しい composable は作らない）。検索はナレッジ管理の一部であり、`useEmbedding` や `db` への依存がすでに `useKnowledge` 内に整っているため、関心の分離を保ちつつ最小限の変更で実装できる。

### SQL（コサイン類似度検索 + タグフィルタ）

CTE で「距離計算 + top-k 絞り込み」と「タグ集約」を分離する。

```sql
WITH ranked AS (
  SELECT
    n.id,
    n.note,
    n.created_at,
    n.embedding <=> $1 AS distance
  FROM notes n
  WHERE
    ($3::text[] IS NULL OR EXISTS (
      SELECT 1 FROM note_tags nt2
      JOIN tags t2 ON nt2.tag_id = t2.id
      WHERE nt2.note_id = n.id AND t2.name = ANY($3)
    ))
  ORDER BY distance
  LIMIT $2
)
SELECT
  r.id,
  r.note,
  r.created_at,
  COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags,
  1 - r.distance AS score
FROM ranked r
LEFT JOIN note_tags nt ON r.id = nt.note_id
LEFT JOIN tags t ON nt.tag_id = t.id
GROUP BY r.id, r.note, r.created_at, r.distance
ORDER BY r.distance
```

- `$1`: クエリの埋め込みベクトル（pgvector 形式文字列）
- `$2`: top-k（デフォルト 5）
- `$3`: タグ名配列（`null` で全件対象）
- `ranked` CTE: タグフィルタと距離計算を行い top-k に絞り込む
- 外側クエリ: 絞り込み済み行にタグを集約し、`1 - distance` でスコアを算出する

### インターフェース

```ts
// useKnowledge に追加
async function searchNotes(
  query: string,
  topK: number = 5,
  tagNames?: string[],
): Promise<SearchResult[]>

interface SearchResult extends Note {
  score: number // 0〜1 のコサイン類似度
}
```

### UI

既存の `app/pages/knowledge/index.vue` に検索セクションを追加する。

- テキスト入力欄 + 検索ボタン
- top-k をスライダーまたは数値入力で指定（デフォルト 5、最大 20）
- タグフィルタ：既存タグ一覧からマルチセレクト（`allTags` を活用）
- 検索結果は類似度スコアをバッジで表示（小数点2桁、例: `0.82`）
- 検索クエリが空の場合は通常の全件一覧を表示（既存動作を維持）

### スコープ（今回）

1. `Note` インターフェースを拡張した `SearchResult` インターフェースを `useKnowledge.ts` に追加
2. `useKnowledge` に `searchNotes(query, topK, tagNames?)` を追加
3. `app/pages/knowledge/index.vue` に検索UIを追加
4. `useKnowledge.test.ts` に `searchNotes` のユニットテストを追加

## Consequences

### ポジティブ

- 既存の `pgvector` 拡張と `useEmbedding` をそのまま活用できる
- `useKnowledge` への追加のみで完結し、新ファイルが最小限
- タグフィルタとベクトル検索を1クエリで実現できる

### ネガティブ

- 検索のたびにクエリ埋め込みを生成するため、初回はモデルロード待ちが発生する（`isEmbeddingLoading` で表示制御）
- `useKnowledge` が肥大化するリスクがある（将来的に `useVectorSearch` として切り出す可能性を残す）

## Alternatives Considered

### A. 新しい composable `useVectorSearch` を作成する

関心の分離は明確になるが、`useEmbedding` と `db` の初期化を二重に扱う必要が生じ、`useKnowledge` との依存関係管理が複雑になる。現時点では `useKnowledge` への追加で十分なため採用しない。

### B. 全文検索（LIKE / FTS）との組み合わせ

pgvector のコサイン類似度検索で意味的な検索は実現できる。全文検索との組み合わせはより高精度になり得るが、PGlite の FTS サポートが限定的であり、Issue スコープを超えるため採用しない。

## Implementation Notes

- pgvector のコサイン距離 `<=>` は `embedding IS NOT NULL` の行のみ有効。`initializeKnowledgeDB` で `embedding vector(384)` は NOT NULL 制約を持たないが、`handleCreate`/`handleUpdate` で必ず埋め込みを生成して保存しているため実運用上 NULL は発生しない
- タグフィルタの `$3::text[]` は PGlite + pgvector での動作確認が必要。問題がある場合は動的クエリ生成（タグフィルタあり/なしで SQL を分岐）に切り替える
- スコアの表示範囲は理論上 0〜1 だが、モデルやデータによっては負になる場合もある。UIでは `Math.max(0, score).toFixed(2)` で表示する
