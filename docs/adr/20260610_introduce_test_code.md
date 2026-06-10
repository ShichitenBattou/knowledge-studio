# ADR: テストコードの導入

- **Date**: 2026-06-10
- **Status**: Proposed
- **Issue**: #23 テストコードの導入

---

## Context

Issue #21 でフォーマッター/リンターが整備され、コードスタイルと静的解析による品質担保ができるようになった。しかし現時点ではテスト基盤が存在せず、以下の問題がある：

- `toPgVector()` などのユーティリティ関数の動作が実行してみるまで確認できない
- リファクタリング時にデグレードを自動検出できない
- `CLAUDE.md` に「テストとフォーマッター/リンターを使用しコード品質を保つ」と明記されているが、テスト部分が未整備のまま

一方でこのプロジェクトはブラウザ内WASM（PGlite）・ブラウザ内ML推論（Transformers.js）を組み合わせた特殊な構成であるため、テスト設計の方針を事前に整理する必要がある。

## Decision

### テストランナー: Vitest + `@nuxt/test-utils`

- **Vitest**: Vite ネイティブのテストランナー。Nuxt 4 が内部で使う Vite と統合されるため設定が最小限で済む。TypeScript / ESM をそのまま扱える。
- **`@nuxt/test-utils`**: Nuxt 公式のテストユーティリティ。`setupTest()` でNuxtランタイムを起動したコンポーネントテストが可能。

### テスト対象と実行環境

| テスト種別           | 対象                                          | Vitest環境  |
| -------------------- | --------------------------------------------- | ----------- |
| ユニットテスト       | `app/utility.ts`（`toPgVector` 等の純粋関数） | `node`      |
| コンポーネントテスト | Vueコンポーネント（将来的に追加）             | `happy-dom` |

PGlite（WASM）・Transformers.js（ML推論）はブラウザ依存のため、ユニットテストではモックまたはテスト対象外とする。

### スコープ（今回）

1. Vitest + `@nuxt/test-utils` のインストールと設定
2. `app/utility.ts` の `toPgVector()` に対するユニットテスト作成
3. `app/composables/useKnowledge.ts` に対するユニットテスト作成（`db` と `useEmbedding` を `vi.mock` でモック）
4. `app/composables/useEmbedding.ts` のテストファイルを作成（中身は空＋コメント）
5. `npm run test` スクリプトの追加

`useEmbedding` のテストファイルを空にする理由：HuggingFace Transformers.js のモデルロードをラップするだけでビジネスロジックが存在しないため、現時点で有意義なテストケースを書けない。ただし「このプロジェクトではすべてのモジュールにテストファイルが存在する」という規約を示すためにファイル自体は作成する。

### 実装内容

```
devDependencies:
  - vitest
  - @nuxt/test-utils

設定ファイル:
  - vitest.config.ts   … Vitest設定（nuxtVitest()プリセット使用）

package.json スクリプト追加:
  "test": "vitest run"
  "test:watch": "vitest"

テストファイル:
  - app/utility.test.ts                       … toPgVector() のユニットテスト
  - app/composables/useKnowledge.test.ts      … handleCreate/handleUpdate/delete系のユニットテスト（db・useEmbedding をモック）
  - app/composables/useEmbedding.test.ts      … 空ファイル（なぜ空かのコメントのみ）
```

## Consequences

### ポジティブ

- ユーティリティ関数の正しさをコード変更のたびに自動検証できる
- `npm run test` という統一コマンドでテストを実行できる状態になる
- 今後の機能追加時にテストを書く文化・基盤が整う

### ネガティブ

- PGlite / Transformers.js はWASM/ブラウザ依存のためユニットテストが困難。統合テストが必要な部分はカバレッジに含められない
- `@nuxt/test-utils` はNuxtプロセスを起動するため、コンポーネントテストは通常のユニットテストより起動が遅い

## Alternatives Considered

### A. Jest

Node.js での標準的なテストランナーだが、ESM サポートの設定が煩雑で、Vite ベースプロジェクトとの相性が悪い。Vitest は Jest 互換 API を持ちつつ ESM ネイティブで動作するため Vitest を採用。

### B. Playwright（E2Eテストのみ）

UIの結合テストには有効だが、ユニットテストには不向きで起動コストが高い。今回のスコープである関数レベルの品質担保には過剰。E2Eテストは別 Issue で検討する。

## Implementation Notes

- `vitest.config.ts` では `environment: 'node'` をデフォルトにし、コンポーネントテストが必要になった時点で `happy-dom` を適宜使用する
- PGlite インスタンス（`app/db.ts`）はテストで import するとWASMバイナリ読み込みに失敗するため、直接 import するテストは書かない（vi.mock でモックする）
- `toPgVector()` は副作用のない純粋関数なので、モック不要でそのままテスト可能
