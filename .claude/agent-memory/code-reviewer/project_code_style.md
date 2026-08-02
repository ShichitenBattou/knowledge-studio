---
name: project-code-style
description: Prettier/ESLint 導入後のコードスタイル規約（ブランチ 21-introduce-formatter-linter で確立）
metadata:
  type: project
---

## フォーマットルール（.prettierrc）

- `semi: false` — セミコロンなし
- `singleQuote: true` — シングルクォート
- `trailingComma: "all"` — 末尾カンマあり（関数引数含む）
- `printWidth: 100` — 行幅100文字

## インデント

- 2スペース（Prettierデフォルト）
- Vueテンプレート・スクリプトともに2スペース

## ESLint

- `@nuxt/eslint` を `nuxt.config.ts` の `modules` に追加（flat config経由）
- `eslint.config.mjs` で `vue/no-multiple-template-root` を `off`（Nuxt 4のレイアウト構造に対応）

## Gitフック（lefthook.yml）

- pre-commit: `prettier --write` → `eslint --fix` → `git add`（stage_fixed: true）
- `parallel: false`（順次実行）

## VSCode設定

- `editor.formatOnSave: true`
- デフォルトフォーマッター: `esbenp.prettier-vscode`
- `source.fixAll.eslint: "explicit"`

**Why:** ブランチ #21 でツールチェーン初導入。既存コードへの初回フォーマット適用は別コミット `chore: 既存コードに初回フォーマット適用` で実施済み。

**How to apply:** 今後のコード変更はすべてこのスタイルに準拠すること。レビュー時にスタイル差分を指摘する際はこのルールを参照。
