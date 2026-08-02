---
name: project-overview
description: Knowledge Studio プロジェクトのアーキテクチャ・技術スタック・ファイル構成の概要
metadata:
  type: project
---

## プロジェクト概要

Knowledge Studio は Nuxt 4 SPA（SSR無効）で、ブラウザ内 PostgreSQL (PGlite via WASM) と HuggingFace Transformers.js を組み合わせたナレッジ管理アプリ。

**Why:** バックエンド不要のオールクライアントサイドアプリとして設計されており、すべてのデータはIndexedDB（`idb://knowledge-studio-pglite`）に永続化される。

**How to apply:** サーバーサイドソリューションや外部APIを提案しない。PGliteのシングルトン（`app/db.ts`）、ベクトル検索（pgvector拡張、384次元）、live queryによるリアクティブUI更新が設計の核心。

## 主要ファイル

- `app/db.ts` — PGlite シングルトン + `initializeKnowledgeDB()` 関数
- `app/utility.ts` — `toPgVector()` ユーティリティ
- `app/composables/useEmbedding.ts` — HuggingFace pipeline ラッパー（`Xenova/all-MiniLM-L6-V2`、384次元）
- `app/composables/useKnowledge.ts` — ノート・タグのCRUD + live query
- `app/components/KnowledgeAddForm.vue`, `KnowledgeList.vue` — UIコンポーネント
- `app/pages/knowledge/index.vue` — メインのナレッジページ
- `app/pages/pglite.vue` — デモページ（動作検証用）

## 注意点

- `app/pages/pglite.vue` はデモ用ページで、本番機能とは別に `initializeDB()` を独自に呼び出している
- `useEmbedding.ts` の `extractor` はモジュールスコープのシングルトンとして管理されている（複数コンポーネントで再ロードを防ぐ設計）
- CLAUDE.md には `paraphrase-multilingual-MiniLM-L12-v2` と記載されているが、実際のコード（`useEmbedding.ts`, `pglite.vue`）は `Xenova/all-MiniLM-L6-V2` を使用しており、ドキュメントと実装が乖離している（既知の齟齬）
- コンポーネントテストは `shallowMount` + `// @vitest-environment happy-dom` を使用し、Nuxt UI コンポーネント（UButton等）は解決できずVue warnが出るが、テスト自体はパスする設計
