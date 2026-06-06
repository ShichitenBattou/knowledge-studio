# ADR: ナレッジ登録機能の実装

- **Date**: 2026-06-06
- **Status**: Proposed
- **Issue**: #4 ナレッジ登録

---

## Context

現在 `app/pages/pglite.vue` にPGlite + Transformers.js の動作検証用デモコードが存在する。このデモは以下を備えているが、プロダクション向け「ナレッジ登録」機能としては不十分。

| 機能 | デモの現状 |
|------|-----------|
| テキスト入力・保存フォーム | ✅ 実装済み |
| 埋め込みベクトル自動生成・保存 | ✅ 実装済み |
| 一覧のリアクティブ表示（live.query） | ✅ 実装済み |
| 個別削除 | ❌ 全削除のみ |
| 編集 | ❌ 未実装 |

Issue #4 の受け入れ条件を満たすには、個別削除と編集が追加で必要。また、デモページのままでは今後のタグ/分類（#5）・ベクトル検索（#6）との統合が難しい。

## Decision

`app/pages/pglite.vue` はデモとして残し、新たに `app/pages/knowledge/index.vue` を作成してナレッジ登録・管理機能を実装する。

### 実装方針

1. **ページ**: `app/pages/knowledge/index.vue`（ナビゲーションからアクセス可能）
2. **DB初期化**: `app/db.ts` に `initializeKnowledgeDB()` 関数を追加し、`notes` テーブルの作成と拡張登録を一元管理する
3. **CRUD操作**:
   - **Create**: テキスト入力フォームから保存時に Transformers.js で 384 次元埋め込みを生成し `notes` テーブルに INSERT
   - **Read**: `db.live.query()` でリアクティブな一覧表示（id / note / 登録日時を表示。embedding は非表示）
   - **Update**: 一覧行のインライン編集（モーダルまたはインプレース）。編集時も埋め込みを再生成して上書き保存
   - **Delete**: 行ごとの削除ボタンで `DELETE FROM notes WHERE id = $1`
4. **テーブルスキーマ拡張**: 将来の編集日時・タグ対応を見越して `created_at TIMESTAMPTZ DEFAULT now()` カラムを追加する
5. **埋め込み処理の共通化**: `pipeline` の初期化を `app/composables/useEmbedding.ts` に切り出し、ページ跨ぎで再利用できるようにする

### ナビゲーション

`app/app.vue` のナビゲーションリンクに「Knowledge」を追加する。

## Consequences

### ポジティブ

- デモ（pglite.vue）を壊さずに機能追加できる
- 今後のタグ/分類（#5）・ベクトル検索（#6）の実装を同ページに統合しやすい
- `useEmbedding` コンポーザブルにより、他ページ（#7 RAG）でも埋め込み生成を再利用できる
- `created_at` カラムの追加で一覧のソートが可能になる

### ネガティブ

- デモと本番ページの2箇所に類似ロジックが残る（将来的にデモページを削除すれば解消）
- 初回ページロード時に Transformers.js のモデルダウンロードが発生し、体感が遅くなる場合がある

## Alternatives Considered

### A. pglite.vue を直接改修する

デモと本番コードが混在し、今後のIssue（#5〜#9）との統合時に責務が不明瞭になるため却下。

### B. 埋め込み生成を db.ts 内で行う

DB初期化とML推論が同ファイルに混在し関心の分離が崩れるため却下。コンポーザブルとして分離する。

## Implementation Notes

- `notes` テーブルの `created_at` カラムは今回追加するが、既存データとの互換性のため `DEFAULT now()` を設定する
- モデルロード中はローディング表示を出し、入力フォームを無効化する
- 編集はモーダルダイアログで実装する（`UModal` + `UForm`）
- 埋め込みの再生成は保存ボタン押下時のみ実行（変更前後のテキスト差分は確認しない）
