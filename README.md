# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

静的サイトを生成する：

```bash
npm run generate
```

出力先は `.output/public/`。

## デプロイ（GitHub Pages）

`master` ブランチへのプッシュで GitHub Actions が自動デプロイします。

**初回のみ**、リポジトリの `Settings > Pages > Source` を **GitHub Actions** に変更してください。

デプロイ先: `https://ShichitenBattou.github.io/knowledge-studio/`

### 仕組みのメモ

GitHub Pages はカスタム HTTP ヘッダーを設定できないため、PGlite（WebAssembly）が必要とする `SharedArrayBuffer` をそのままでは使えない。
`public/coi-serviceworker.js`（[coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)）をサービスワーカーとして登録することで `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` ヘッダーをクライアント側で付与し、この制限を回避している。
