# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ルール（厳守）

### 常時有効にするMCP

- **Serena MCP**: 作業開始前に必ず `mcp__serena__initial_instructions` を呼び出すこと

### 編集手順

1. ブランチを作成し、GitHub Projects MCPツールでIssueのステータスをIn Progressに変更する

   - 下記コマンドでブランチを作成してチェックアウトする（<ISSUE_NUMBER>を置換）

   ```bash
   gh issue develop <ISSUE_NUMBER> --checkout
   ```

   - `.github/project.env` からプロジェクト設定値を読み込む（`PROJECT_NUMBER`, `PROJECT_STATUS_FIELD_ID`, `PROJECT_STATUS_IN_PROGRESS_OPTION_ID`）
   - `projects_list`（list_project_items）で対象プロジェクトのアイテムIDを取得する
   - `projects_write`（update_project_item）でStatusフィールドをIn Progressに更新する
2. ADRを`docs/adr`配下に作成し認識合わせを行う。　※[ADRに関してのルール](#adrに関してのルール)を参照
3. ADRのStatusをProposedにしてコミット
4. 監理者にADRのチェック・フィードバックを依頼し、待機
5. 監理者からのADRに関するフィードバックを反映し、コミット
6. 4~5を監理者の承諾が得られるまで継続
7. 監理者の承諾が得られればADRのStatusをAcceptedに変更しコミット
8. ADRの内容に基づいて実装を行う
9. 実装後、テストとフォーマッター/リンターを使用しコード品質を保つ（現在は未整備のため対応不要）
10. `pr-creator` サブエージェントでPRを作成する（Issue番号を引数で渡す）
    - ドラフトPRの場合はその旨を明示して指示する
    - pr-creatorが自動でindex.json参照・Closes #・Reviewer指定を行う
11. 監理者に実装のチェック・フィードバックを依頼し、待機
12. 監理者からの実装に関するフィードバックを反映する（ADRの修正/テスト/フォーマットも実施すること）
13. 11~12を監理者の承諾が得られるまで継続

### ADRに関してのルール

- ファイル名は「<年月日>_<作業概要(英語で)>.md」とする
- 下記の内容は必ず記載すること
  - Context: なぜこの決定が必要か（背景・問題・現状）
  - Decision: 何を採用するか / どう実装するか
  - Consequences: ポジティブ・ネガティブの両面
  - Alternatives Considered: 複数案を検討した場合は必須、1案しかない場合は省略可
  - Implementation Notes: 実装者向けの補足（省略可だが推奨）
- フォーマット自体は自由、ただし最新のADRをフォーマットの参考にすること
- 概要をまとめる為に「<年月日>_<作業概要(英語で)>.index.json」も作成すること
  - jsonにはadrFile, title, status, summary, relatedFilesを含める事

### その他のルール

- Pythonのコードはuvを使って実行すること
- ブランチ名は英語で記述すること

## コマンド

```bash
npm run dev        # 開発サーバーを http://localhost:3000 で起動
npm run build      # 本番ビルド
npm run generate   # 静的サイト生成
npm run preview    # 本番ビルドのプレビュー
```

リントやテストのスクリプトはまだ設定されていない。

Node.jsのバージョンはVoltaで24.16.0に固定されている（`package.json`の`volta`フィールド参照）。

## アーキテクチャ

**Knowledge Studio** はNuxt 4のSPA（SSR無効）で、WebAssembly経由でブラウザ内にPostgreSQLデータベースをフル稼働させるアプリケーション。

### 主要な設計方針

- **SSR無効**: `nuxt.config.ts`で`ssr: false`。すべてのデータアクセスはクライアントサイドのみ。
- **ブラウザ内PostgreSQL（PGlite）**: `app/db.ts`がモジュールロード時にPGliteのシングルトンインスタンスを初期化する。WASMバイナリとデータファイルは`/public/pglite/`から`WebAssembly.compileStreaming`で読み込む。データの永続化にはIndexedDB（`idb://knowledge-studio-pglite`）を使用。
- **ベクトル検索**: PGliteは`pgvector`拡張を有効にして動作。埋め込みは384次元（`Xenova/all-MiniLM-L6-V2`使用）。
- **ブラウザ内ML推論**: `@huggingface/transformers`が埋め込みモデルをブラウザ内で完結させる。バックエンドへのAPIコールは発生しない。
- **リアクティブDBクエリ**: PGliteの`live`拡張（`db.live.query(...)`）でクエリ結果をリアクティブにし、データ変更時にVueコンポーネントが自動再描画される。

### データフロー（notesフィーチャー）

1. ユーザーがテキストを送信 → `@huggingface/transformers`のpipelineがブラウザ内で384次元の埋め込みベクトルを生成
2. `toPgVector()`（`app/utility.ts`）が配列をPostgreSQLのベクトルリテラル形式 `[x,y,z,...]` にシリアライズ
3. `notes`テーブルに行を挿入（スキーマ: `id UUID, note TEXT, embedding vector(384)`）
4. `onMounted`内のliveクエリがUIテーブルをリアクティブに維持

### スタック

| レイヤー | 技術 |
|---|---|
| フレームワーク | Nuxt 4 |
| UI | Nuxt UI v4（Tailwind CSS v4） |
| データベース | PGlite（WASM経由のブラウザ内PostgreSQL） |
| ML | HuggingFace Transformers.js |
| カラーテーマ | デフォルトはダーク、primary=fuchsia、secondary=indigo、accent=cyan |

### ファイル構成

- `app/db.ts` — PGliteのシングルトンインスタンス、DB操作が必要な箇所でimportして使用
- `app/utility.ts` — 共通ユーティリティ（現状は`toPgVector`のみ）
- `app/app.config.ts` — Nuxt UIのカラーパレット設定
- `app/pages/pglite.vue` — DB・ML・UIを組み合わせたメインのデモページ
