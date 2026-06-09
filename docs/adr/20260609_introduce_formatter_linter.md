# ADR: フォーマッター/リンターの導入

- **Date**: 2026-06-09
- **Status**: Accepted
- **Issue**: #21 フォーマッター/リンターを導入

---

## Context

Issue #4（ナレッジ登録）・#5（タグ/分類）の実装が完了し、コードベースが拡張されつつある。現状はフォーマッターもリンターも存在せず、以下の問題がある：

- コーディングスタイルが統一されていない（インデント・クォート等）
- Vue / TypeScript の静的解析が行われず、潜在的なバグが検出されない
- コミット時に品質チェックが走らないため、スタイル崩れが混入しやすい
- `CLAUDE.md` に「テストとフォーマッター/リンターを使用しコード品質を保つ」と明記されているが、現状は未整備

## Decision

### フォーマッター: Prettier

- 設定が少なくすぐに使えるデファクトスタンダードのフォーマッター
- Vue / TypeScript / JSON / CSS など全ファイル種別を統一的に処理できる
- `.prettierrc` で最小限の設定を管理する

### リンター: `@nuxt/eslint`（ESLint flat config）

- Nuxt 4 公式の ESLint モジュール。`nuxt.config.ts` に追加するだけで Vue / TypeScript / Nuxt 固有のルールが有効になる
- ESLint flat config（`eslint.config.mjs`）形式で設定する
- `@nuxt/eslint` は内部で `@typescript-eslint`・`eslint-plugin-vue` を含むため追加インストール不要

### Gitフック管理: lefthook

- 軽量・高速なGitフックマネージャー
- `lefthook.yml` でpre-commitフックを定義し、コミット前に自動でフォーマット＆Lint修正を実行する

### ファイル保存時の自動フォーマット: VS Code設定

- `.vscode/settings.json` に `editor.formatOnSave: true` と Prettier をデフォルトフォーマッターとして設定する
- チーム全員が同じ設定で開発できるようリポジトリにコミットする

### 実装内容

```
devDependencies:
  - prettier
  - @nuxt/eslint
  - @lefthook/linux（lefthookバイナリ）または lefthook

設定ファイル:
  - .prettierrc          … Prettierオプション
  - .prettierignore      … フォーマット除外パス
  - eslint.config.mjs    … ESLint flat config（@nuxt/eslint使用）
  - lefthook.yml         … pre-commitフック定義
  - .vscode/settings.json … 保存時フォーマット設定
```

`package.json` のスクリプトに以下を追加する：

```json
"lint": "eslint .",
"lint:fix": "eslint . --fix",
"format": "prettier --write .",
"format:check": "prettier --check ."
```

lefthookのpre-commitフックは以下を実行する：
1. `prettier --write` でステージ済みファイルを整形
2. `eslint --fix` でステージ済みファイルをLint修正
3. 修正済みファイルを再ステージ（`git add`）

## Consequences

### ポジティブ

- コードスタイルが統一され、レビュー時にスタイル差分が発生しなくなる
- TypeScript / Vue の静的解析によりバグを早期に検出できる
- コミット時に自動修正が走るため、手動でのフォーマット操作が不要になる
- 今後の実装（#6〜#9等）から品質基準が担保された状態で開発できる

### ネガティブ

- 初回導入時に既存コード全体をフォーマットするコミットが必要（git blameが汚れる）
- lefthookのインストール（`lefthook install`）を開発者が手動で実行する必要がある
- ESLintルールに引っかかるコードが修正対象になり、リファクタリングコストが発生する可能性がある

## Alternatives Considered

### A. Biome（Prettier + ESLint の代替オールインワンツール）

高速でPrettierとESLintを置き換えられるが、Nuxt公式サポートがなく`@nuxt/eslint`との共存が困難なため却下。

### B. husky + lint-staged

lefthookと同等機能だが、Node.js依存でインストールが重くなる。lefthookはバイナリ単体で動作し高速なため、lefthookを採用。

## Implementation Notes

- lefthookのインストールは `npx lefthook install` で行う（CIでは不要）
- `.prettierignore` には `node_modules/`, `dist/`, `.nuxt/`, `public/pglite/` を含める（WASMバイナリ等を除外）
- `@nuxt/eslint` の設定は `nuxt.config.ts` に `modules: ['@nuxt/eslint']` を追加するだけで有効になる
- 既存コードへの初回フォーマット適用は、通常コミットとは分けて「chore: apply initial formatting」として単独でコミットする
