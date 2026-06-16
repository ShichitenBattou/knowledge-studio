# ADR: RAG（ブラウザ内LLM）と出典表示

- **Date**: 2026-06-16
- **Status**: Proposed
- **Issue**: #7 RAG（ブラウザ内LLM）/ #8 出典表示

---

## Context

Issue #6（ベクトル検索）によってナレッジの類似度検索が実装された。次のステップとして、その検索結果をコンテキストとしてブラウザ内LLMに渡し、自然言語で回答を生成する RAG（Retrieval-Augmented Generation）パイプラインを構築する。

現在のスタックには：

- `@huggingface/transformers` が既に依存関係に含まれ、384次元埋め込み生成に使用されている
- `searchNotes`（`useKnowledge`）がベクトル検索の取得層として機能している

外部APIへの通信を行わず、全処理をブラウザ内で完結させるという設計方針は継続する。

## Decision

### フレームワーク選定

**`@huggingface/transformers`（Transformers.js）を採用する。**

WebLLM（WebGPU推論）は未評価デバイスで利用不可のリスクがあり、追加依存も必要。既に導入済みの Transformers.js で `text-generation` タスクを追加することで、依存追加なしで実装できる。

### モデル選定

**`onnx-community/Qwen2.5-0.5B-Instruct`、量子化 `dtype: 'q4'`** を採用する。

- サイズ: q4量子化で約300MB（ブラウザキャッシュ後は再ダウンロード不要）
- 日本語対応: Qwen2.5シリーズは多言語サポートあり
- Issue #7 で候補として明記されていた `Xenova/Qwen2.5-0.5B-Instruct` の後継

### 新コンポーザブル `useRag.ts`

```typescript
interface RagSource {
  id: string
  note: string
  similarity: number
  tags: string[]
}

interface RagResult {
  answer: string
  sources: RagSource[]
}
```

エクスポートするステート・関数:

| 名前                     | 型                 | 説明                           |
| ------------------------ | ------------------ | ------------------------------ |
| `isModelLoading`         | `Ref<boolean>`     | モデル初回ロード中フラグ       |
| `modelLoadProgress`      | `Ref<number>`      | ロード進捗 0–100%              |
| `isGenerating`           | `Ref<boolean>`     | 推論中フラグ                   |
| `streamingAnswer`        | `Ref<string>`      | ストリーミング中の途中テキスト |
| `sources`                | `Ref<RagSource[]>` | 最後に参照したナレッジ一覧     |
| `generate(query, topK?)` | `Promise<string>`  | RAG実行。回答テキストを返す    |

**処理フロー:**

1. `searchNotes(query, topK)` で関連ナレッジを取得（既存 `useKnowledge` を利用）
2. 取得ナレッジでプロンプトを構築
3. Transformers.js の `TextStreamer` でストリーミング推論
4. `streamingAnswer` をコールバックで逐次更新
5. 完了後 `sources` に取得ナレッジをセット

**プロンプトテンプレート:**

```
あなたはナレッジベースのアシスタントです。以下の参照ナレッジをもとに質問に回答してください。
参照ナレッジにない情報は含めないでください。

## 参照ナレッジ
{1番から始まるナレッジ一覧}

## 質問
{query}

## 回答
```

**モデルの初期化タイミング:** `generate()` 初回呼び出し時にレイジーロードする（ページロード時にダウンロードしない）。Transformers.js の Cache API / OPFS によりモデルは自動的にブラウザにキャッシュされ、2回目以降はネットワーク不要。

### 新ページ `app/pages/rag/index.vue`

ナレッジページ（`knowledge/index.vue`）と分離した専用ページを設ける。

**UI構成:**

- テキストエリア（質問入力）
- top-k 数値入力（デフォルト 5、1–10）
- 「回答を生成」ボタン（推論中はローディング表示）
- モデルロード中オーバーレイ（進捗バー付き）
- 回答エリア（ストリーミング表示）
- 出典セクション（Issue #8対応）:
  - 参照したナレッジ件数の表示
  - 各ナレッジのタイトル（先頭30文字）と類似度スコア（小数点2桁）
  - 各ナレッジをクリックすると全文をモーダルで確認できる

### Issue #8（出典表示）の実装

Issue #8 の受け入れ条件をすべて `app/pages/rag/index.vue` で満たす：

- [x] 参照したナレッジのタイトル（先頭30文字）と類似度スコアを表示
- [x] 各出典をクリックするとナレッジ全文をモーダルで確認できる
- [x] 出典の数（参照したナレッジ件数）が表示される

### テスト追加

`app/composables/useRag.test.ts` に以下を追加:

- `generate()` がベクトル検索を正しく呼び出す
- `isGenerating` が推論中 `true`、完了後 `false` になる
- `isModelLoading` が初回ロード中 `true`、ロード後 `false` になる
- `sources` が検索結果と一致する
- `generate()` 中の再呼び出しが無視される（並行実行防止）

## Consequences

### ポジティブ

- 全処理ブラウザ内完結（外部APIコールなし）を維持できる
- `@huggingface/transformers` を既に使用しているため、依存追加なしで実装できる
- Qwen2.5-0.5B は q4量子化で約300MBと比較的小さく、ほぼすべてのデスクトップデバイスで動作する
- 2回目以降はモデルキャッシュが効くためオフライン動作も可能

### ネガティブ

- モデルの初回ダウンロードに数分かかる（モバイル回線では特に影響大）
- 0.5Bモデルの推論品質に限界がある（複雑な質問・長文生成に弱い可能性）
- ブラウザのメモリ消費量が増加する（埋め込みモデル + LLMモデルの同時保持）

## Alternatives Considered

### WebLLM（WebGPU推論）

WebGPU を使用し、より高速な推論が可能。ただし：

- WebGPU は Firefox 安定版未対応、古いデバイスでは非対応
- 追加依存（`@mlc-ai/web-llm`）が必要
- フォールバック実装が複雑になる

デバイス互換性と実装コストの観点からこの段階では見送り。

### Phi-3-mini（3.8B）

Issue #7 で候補に挙がっていたが、ブラウザで動作させるには大きすぎる（量子化後でも1GB超）。

## Implementation Notes

- `useRag.ts` は `useKnowledge` を内部でインポートし `searchNotes` を呼び出す（コンポーネント経由は不要）
- `TextStreamer` のコールバックは `streamingAnswer.value += token` でシンプルに実装する
- モデルロード進捗は Transformers.js の `progress_callback` オプションで取得できる（`progress.loaded / progress.total * 100`）
- 並行実行防止のため `isGenerating` が `true` の間は `generate()` を即時 `return` する
- プロンプト生成時、ナレッジが0件の場合はLLMを呼ばずに「関連するナレッジが見つかりませんでした」を返す
