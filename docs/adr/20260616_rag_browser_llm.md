# ADR: RAG（ブラウザ内LLM）と出典表示

- **Date**: 2026-06-16
- **Status**: Accepted
- **Issue**: #7 RAG（ブラウザ内LLM）/ #8 出典表示

---

## Context

Issue #6（ベクトル検索）によってナレッジの類似度検索が実装された。次のステップとして、その検索結果をコンテキストとしてブラウザ内LLMに渡し、自然言語で回答を生成する RAG（Retrieval-Augmented Generation）パイプラインを構築する。

Discussion #27「オフラインRAG: ブラウザ内LLM推論のライブラリ構成」にて、ライブラリ選定の方針が合意された：

- 埋め込み生成: `@huggingface/transformers`（現状維持）
- テキスト生成: `@mlc-ai/web-llm`（WebGPU推論、新規追加）

WebLLM はエンコーダー型モデルをサポートしないため、埋め込み生成には引き続き Transformers.js を使用する役割分担が最適と判断された。

外部APIへの通信を行わず、全処理をブラウザ内で完結させるという設計方針は継続する。

## Decision

### ライブラリ構成

| 役割         | ライブラリ                          |
| ------------ | ----------------------------------- |
| 埋め込み生成 | `@huggingface/transformers`（既存） |
| テキスト生成 | `@mlc-ai/web-llm`（新規追加）       |

WebLLM は WebGPU バックエンドで LLM のチャット・生成に特化しており、Transformers.js の ONNX Runtime より大規模モデルの推論速度が高い。

### モデル選定とモデル選択 UI

Discussion #27 の方針に従い、ユーザーがモデルを選択できる UI を設ける。初期候補：

| モデル                              | VRAM目安 | 特徴             |
| ----------------------------------- | -------- | ---------------- |
| `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | ~2GB     | 軽量・日本語対応 |
| `Phi-4-mini-instruct-q4f16_1-MLC`   | ~4GB     | 高品質・多言語   |

デフォルトは `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` とする（より広いデバイスで動作するため）。

### 新コンポーザブル `useRag.ts`

```typescript
interface RagSource {
  id: string
  note: string
  similarity: number
  tags: string[]
}
```

エクスポートするステート・関数:

| 名前                     | 型                 | 説明                           |
| ------------------------ | ------------------ | ------------------------------ |
| `isModelLoading`         | `Ref<boolean>`     | モデル初回ロード中フラグ       |
| `modelLoadProgress`      | `Ref<string>`      | WebLLMのロード進捗テキスト     |
| `isGenerating`           | `Ref<boolean>`     | 推論中フラグ                   |
| `streamingAnswer`        | `Ref<string>`      | ストリーミング中の途中テキスト |
| `sources`                | `Ref<RagSource[]>` | 最後に参照したナレッジ一覧     |
| `selectedModel`          | `Ref<string>`      | 選択中のモデルID               |
| `generate(query, topK?)` | `Promise<string>`  | RAG実行。回答テキストを返す    |
| `loadModel(modelId)`     | `Promise<void>`    | 指定モデルをロードする         |

**処理フロー:**

1. `searchNotes(query, topK)` で関連ナレッジを取得（既存 `useKnowledge` を利用）
2. ナレッジが0件の場合はLLMを呼ばず「関連するナレッジが見つかりませんでした」を返す
3. 取得ナレッジでプロンプトを構築
4. WebLLM の `engine.chat.completions.create()` でストリーミング推論
5. `streamingAnswer` をデルタで逐次更新
6. 完了後 `sources` に取得ナレッジをセット

**プロンプトテンプレート:**

```
あなたはナレッジベースのアシスタントです。以下の参照ナレッジをもとに質問に回答してください。
参照ナレッジにない情報は含めないでください。

## 参照ナレッジ
1. {ナレッジ1}
2. {ナレッジ2}
...

## 質問
{query}

## 回答
```

**モデルの初期化タイミング:** `loadModel()` を明示呼び出し（ページマウント時 or ユーザー操作時）。WebLLM はモデルを IndexedDB にキャッシュするため、2回目以降はネットワーク不要。

### 新ページ `app/pages/rag/index.vue`

ナレッジページ（`knowledge/index.vue`）と分離した専用ページを設ける。

**UI構成:**

- モデル選択セレクト（候補モデル一覧から選択）
- モデルロードボタン（ロード中は進捗テキスト表示）
- テキストエリア（質問入力）
- top-k 数値入力（デフォルト 5、1–10）
- 「回答を生成」ボタン（推論中はローディング表示、モデル未ロード時はdisabled）
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
- `sources` が検索結果と一致する
- `generate()` 中の再呼び出しが無視される（並行実行防止）
- ナレッジが0件の場合はLLMを呼ばずに固定メッセージを返す

## Consequences

### ポジティブ

- 全処理ブラウザ内完結（外部APIコールなし）を維持できる
- WebGPU推論により Transformers.js（ONNX）より高速な生成が可能
- モデル選択UIでデバイス性能に応じた使い分けができる
- 2回目以降はIndexedDBキャッシュによりオフライン動作が可能

### ネガティブ

- WebGPU は Firefox 安定版・一部古いデバイスで未対応（要フォールバック検討）
- `@mlc-ai/web-llm` の依存追加が必要
- 1.5B モデルでも初回ダウンロードは数百MB〜2GB規模
- WebGPU対応ブラウザ（Chrome 113+、Edge 113+）が必要

## Alternatives Considered

### テキスト生成もTransformers.jsで行う

追加依存なしで実装できるが、WebLLM に比べて大規模モデルの推論速度が遅く、Discussion #27 の合意と異なる。

### Phi-4-mini-instruct をデフォルトモデルにする

品質は高いが VRAM ~4GB 必要。デフォルトは低スペックデバイスでも動作する Qwen2.5-1.5B とし、ユーザーが任意で切り替えられる設計にする。

## Implementation Notes

- `useRag(searchFn)` は検索関数を引数で受け取る依存注入方式を採用する（Vue の `onMounted` ライフサイクル問題を避けるため、`useKnowledge` を内部インポートせず呼び出し元でバインドする）
- WebLLM エンジンは `MLCEngine` のシングルトンとして保持する
- モデルロード進捗は WebLLM の `initProgressCallback` コールバックで `modelLoadProgress` を更新する
- ストリーミングは `engine.chat.completions.create({ stream: true })` の非同期イテレータで実装し、`delta.content` を `streamingAnswer.value` に逐次追記する
- 並行実行防止のためモジュールスコープの `_isGenerating` boolean ロックを用い、`generate()` を即時 `return` する
- UI 向けステート（`isGenerating`, `streamingAnswer`, `sources`）は `useRag()` 呼び出しごとのローカル ref として保持し、モジュール間の干渉を防ぐ
- 検索専用コンポーザブル `useKnowledgeSearch(generateEmbedding)` に `searchNotes` を分離し、RAG ページで不要な live query 購読が発生しないようにする
- `generateEmbedding` は呼び出し元から DI で注入することで `useEmbedding()` の二重呼び出しを防ぐ
- WebGPU 非対応ブラウザでは `loadModel()` 呼び出し時にエラーを捕捉してユーザーに通知する
