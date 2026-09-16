# AI 共有リンク一元管理 PWA アプリ

## プロジェクト概要
AIの共有URLをPWA共有シートやPCから1タップで保存・管理するアプリ。
仕様詳細は `plan.md` を参照すること。

## 基本コマンド
- 開発サーバー起動: `npm run dev`
- ビルドチェック: `npm run build`
- リンター: `npm run lint`

## 開発ルール & 制約事項
- **言語・対話**: 回答、コード内のコメント、コミットメッセージはすべて「日本語」で行うこと。
- **ランタイム**: Cloudflare Pages (Edge) で動くため、Node.js 固有のモジュール（`fs`, `path` 等）は使用不可。
- **セキュリティ**: `.env` や秘密鍵情報は絶対にコードに直書き・コミットしないこと。
- **実装手順**: 新しい機能を実装する際は、まず変更方針を1文で説明してからコードを提案すること。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
