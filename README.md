# ChatHub

各種AI（ChatGPT, Claude, Gemini, DeepSeek等）のチャット共有URLを、PWA共有シートやPCブラウザから1タップで保存・整理・検索できるPWAアプリ。

**本番URL**: `https://<your-worker-subdomain>.workers.dev`（実際のURLはデプロイ時に決まります）

## 主な機能

- **リンク管理**: 共有URLの登録・編集・削除、お気に入り、フォルダ分け（ドラッグ&ドロップ対応）、タグ付け
- **自動メタデータ取得**: 共有URL入力時にタイトル・本文を自動取得（OGP fetch → Cloudflare Browser Rendering → Jina Readerの3段階フォールバック）
- **検索・フィルター**: キーワード検索（常時表示）＋AIツール種別・期間・お気に入り・タグによる詳細フィルター（アコーディオン開閉、絞り込み適用中バッジ表示）
- **サーバー全文検索**: 一覧の軽量インデックスでは届かない本文奥のキーワードも検索可能
- **ページネーション**: 1ページ20件、Google検索風のページ番号UI
- **フォルダ・タグ管理**: 階層フォルダ、任意順並び替え、空フォルダ一括削除
- **PWA対応**: ホーム画面インストール、Android Web Share Target、iOS用ペーストボタン
- **テーマ・表示設定**: ライト/ダークテーマ（デフォルトはライト）、文字サイズ設定（小/中/大、デフォルト中）
- **エクスポート**: 全リンクをJSON形式でダウンロード
- **アカウント削除**: 全データ＋認証アカウントの完全削除

## 技術スタック

| 領域 | 選定 |
|---|---|
| Framework | Next.js (App Router) |
| Styling | Tailwind CSS, shadcn/ui |
| 認証 | Supabase Auth（メール/Google/GitHub/X） |
| データ層 | Cloudflare KV |
| ホスティング | Cloudflare Workers（`@opennextjs/cloudflare` + `wrangler`） |
| メタデータ取得 | 標準fetch（OGP）+ Cloudflare Browser Rendering（Puppeteer）+ Jina Reader |

設計判断の詳細な経緯・トレードオフは [plan.md](plan.md) を参照してください。

## セットアップ

### 必要な環境変数

このプロジェクトは環境変数をサーバー側（`.dev.vars`）とクライアント側（`.env.local`）で二重に管理します（詳細は plan.md 4.3章）。それぞれのテンプレートをコピーして値を設定してください。

```bash
cp .dev.vars.example .dev.vars
cp .env.local.example .env.local
```

必要な値（Supabaseダッシュボードの Project Settings > API から取得）:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`（両ファイルに重複設定）
- `SUPABASE_SERVICE_ROLE_KEY`（`.dev.vars`のみ、アカウント削除機能用）
- `JINA_API_KEY`（`.dev.vars`のみ、任意。メタデータ取得のフォールバック用）

### 開発サーバー起動

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) で確認できます。

Cloudflare固有の機能（Cache API、Browser Rendering等）は実際のWorkersランタイムでのみ動作するため、素の `next dev` ではフィーチャー検出により自動的にスキップ/フォールバックされます。

### ビルド・Lint確認

```bash
npm run build
npm run lint
```

### デプロイ（Cloudflare Workers）

```bash
npm run deploy
```

初回デプロイ前に、以下の準備が必要です（詳細はplan.md参照）:

1. Cloudflare KV Namespaceを作成し、`wrangler.jsonc`の`kv_namespaces`にバインド
2. `wrangler.jsonc`にBrowser Rendering binding（`browser.binding`）を設定
3. 上記の環境変数を `wrangler secret put <NAME>` で本番Secretsとして登録
4. Supabaseダッシュボードで、本番ドメインをRedirect URLs / Site URLに追加

**Windows特有の注意**: `opennextjs-cloudflare build`は`.open-next`ディレクトリを再作成するため、ローカルの`next dev`プロセスを起動したままデプロイするとファイルロック（EPERM）で失敗します。デプロイ前に`next dev`を停止してください。

## ディレクトリ構成

```
src/
├── app/
│   ├── page.tsx              # メイン画面
│   ├── login/page.tsx        # ログイン画面
│   ├── manifest.ts           # PWA manifest
│   ├── share/route.ts        # Android Web Share Targetの受け口
│   └── api/                  # items/folders/tags/metadata/search/account 等のAPIルート
├── components/                # UIコンポーネント（items/folders/tags/ui配下含む）
├── lib/
│   ├── kv/                   # Cloudflare KVデータ層
│   ├── auth/                 # Supabase認証検証
│   └── supabase/              # Supabaseクライアント
wrangler.jsonc                 # Cloudflareバインド設定（KV, Browser Rendering, Assets等）
```

## ドキュメント

- [plan.md](plan.md) — 設計判断・トレードオフの詳細記録（章立て）
- [HANDOVER.md](HANDOVER.md) — セッション間の引き継ぎ記録
