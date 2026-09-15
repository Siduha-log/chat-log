# HANDOVER.md — セッション引き継ぎドキュメント

最終更新: 2026-09-15（コミット `f91220f` 時点）

このドキュメントは、これまでの会話セッションで進めてきた実装を、別セッション（別のClaude会話／別の開発者）が引き継げるようにするための状況整理です。設計判断の詳細な経緯・トレードオフは **[plan.md](plan.md)** に章立てで記録されているので、「なぜそうしたか」を知りたい場合は必ずそちらを参照してください。このHANDOVER.mdは「今どこまで進んでいて、次に何をすべきか」を素早く把握するためのものです。

## 1. プロジェクト概要と進捗状況

**アプリの目的**: 各種AI（Gemini, ChatGPT, Claude, DeepSeek等）のチャット共有URLを、1タップで保存・整理・検索できるPWA。詳細仕様はplan.md 1〜3章。

**技術スタック**: Next.js (App Router) + Tailwind CSS + shadcn/ui、認証はSupabase Auth、データはCloudflare KV、ホスティングはCloudflare Pages（`@opennextjs/cloudflare`アダプタ経由）。

**進捗状況**（plan.md 7章の実装ステップ対比）:

| ステップ | 内容 | 状態 |
|---|---|---|
| 1 | プロジェクト初期化（Next.js, next-on-pages→opennextjs-cloudflareに変更） | ✅ 完了 |
| 2 | Supabase Auth設定（メール/Google/GitHub/X） | ✅ 完了・実機確認済み |
| 3 | Cloudflare KV Namespace作成・バインド | ✅ 完了 |
| 4 | 認証フロー実装 | ✅ 完了（ステップ2と統合実装済み） |
| 5 | API実装（`/api/items`, `/api/folders`, `/api/tags`, `/api/metadata`等） | ✅ 完了 |
| 6 | メイン画面UI（一覧・検索・フィルター・エクスポート） | ✅ 完了、複数回のUI/UX改善済み |
| 7 | PWA / 共有機能（manifest.json, Web Share Target, iOSペースト） | ❌ **未着手** |
| — | Cloudflare Pagesへの実デプロイ | ❌ **未実施・未検証**（`wrangler deploy --dry-run`でバンドルサイズ確認のみ） |

**次にやるべきタスク**は4章を参照。

## 2. これまでに完了した実装

### 認証（Supabase）
- メール/パスワード + Google/GitHub/X（`provider: "x"`。Supabaseの新OAuth2.0プロバイダで、旧`"twitter"`とは別物）
- ブラウザ用/サーバー用クライアントを分離（`src/lib/supabase/client.ts` / `server.ts`）
- APIルートでのuser_id検証は、SupabaseへgetUser()をリモート検証し、結果をCloudflare Cache APIで60秒キャッシュ（`src/lib/auth/verify.ts`）。**重要な既知の注意点**: `caches`グローバルは素の`next dev`には存在せず、実際のWorkersランタイム（本番/`opennextjs-cloudflare preview`）でのみ利用可能。フィーチャー検出でフォールバックしている。
- サーバー側でCloudflareの環境変数を読む際は`process.env`ではなく**`getCloudflareContext().env`**を使う（この構成特有の必須事項、plan.md 4.3章）。
- `NEXT_PUBLIC_*`環境変数は`.dev.vars`（サーバー用）と`.env.local`（クライアントバンドル用）の**両方に重複設定が必要**。テンプレートは`.dev.vars.example` / `.env.local.example`。

### データ層（Cloudflare KV, `src/lib/kv/`）
- キー構成: `user:{id}:items:{itemId}`（本体）/ `user:{id}:index`（軽量一覧、検索用）/ `user:{id}:folders`（フォルダ木構造）/ `user:{id}:tags`（タグ登録一覧）
- `items.ts`: CRUD + `bulkUpdateItems()`（複数アイテムへの一括パッチ。個別キーは並列書き込み、indexキーは最後に1回だけ書き込むことで競合を回避する共通プリミティブ。タグのリネーム/削除カスケード、フォルダ削除時のfolderId解除で使う）
- `folders.ts`: `parentId`による木構造、循環チェック（`wouldCreateCycle`）、任意順並び替え（`order`フィールド）。**フォルダ削除は中身を削除せず`folderId: null`に解除するだけ**（子フォルダが残っている場合のみ409でブロック）
- `tags.ts`: デフォルトタグ`["調査","相談","計画"]`を初回アクセス時に遅延シード。リネーム/削除は該当アイテムへカスケード
- 既知のトレードオフ（同時書き込み競合、部分失敗）は個人利用規模を前提に許容——plan.md 5.3章

### API（`src/app/api/`）
`/api/items`（GET/POST）, `/api/items/[id]`（GET/PATCH/DELETE）, `/api/folders`（GET/POST）, `/api/folders/[id]`（PATCH/DELETE）, `/api/folders/reorder`（PATCH）, `/api/tags`（GET/POST/PATCH/DELETE）, `/api/export`（GET、全件JSON）, `/api/metadata`（GET、OGP自動取得）。全て`Authorization: Bearer <access_token>`必須。

### UI（`src/app/page.tsx` 中心）
- **一覧表示**: カードではなくテーブル/リスト形式（`ItemTable`）。検索・タグ(複数選択)・AIツール・お気に入り・期間フィルター、並び替え（新着/古い/タイトル昇降順）は**全部クライアント側で処理**（初回に一覧を1回フェッチした後、APIを叩き直さない設計。認証込みAPIをキー入力毎に叩くのを避けるため）
- **フォルダ**: サイドバー（PC: 可変幅`ResizableSidebar`、デフォルト20rem・ドラッグでリサイズ・localStorage記憶／モバイル: `Sheet`ドロワー）。行を別の行にドラッグ&ドロップすると新規フォルダ作成ダイアログ、既存フォルダにドロップすると直接移動
- **フォーム**: 新規登録ボタンはトグル式（もう一度押すと閉じる）。フォルダ名は30文字まで（`FOLDER_NAME_MAX_LENGTH`定数、サーバー/クライアント両方でバリデーション。IME変換中は`maxLength`属性が効かないことがあるため`onChange`側でもクリップ）
- **テーマ**: ライト/ダーク切り替え（`ThemeToggle`、`layout.tsx`のインラインスクリプトでFOUC防止）。配色はOKLCHのくすみ系パステル、アクセントはスカイブルー（`globals.css`）
- **OGP自動取得**（`/api/metadata`）: タイトル/説明文/AIツール名を自動取得。Bot名乗りのUser-Agentだと403/チャレンジページを返されるため一般的なブラウザUAを使用。ChatGPTは`og:title`が汎用招待文言なため`<title>`タグを優先する特別分岐あり（実URLで検証済み）。Claudeは会話固有のメタデータがHTMLのどこにも存在しない（修正不可能）。Geminiは共有ドメインのリダイレクト先がNode.js標準fetch(undici)のヘッダーサイズ上限を超え取得失敗する場合がある（`next dev`固有の可能性、本番Workers環境では未検証）

## 3. ディレクトリ構造と主要ファイル

```
src/
├── app/
│   ├── page.tsx              # メイン画面（状態管理・フィルタリング・全ハンドラの起点）
│   ├── login/page.tsx        # ログイン画面
│   ├── layout.tsx            # ルートレイアウト（テーマ初期化スクリプト）
│   ├── globals.css           # OKLCHテーマ定義（light/dark）
│   ├── auth/callback/route.ts    # OAuthコールバック
│   └── api/
│       ├── items/route.ts            # GET(一覧)/POST(作成)
│       ├── items/[id]/route.ts       # GET/PATCH/DELETE
│       ├── folders/route.ts          # GET/POST
│       ├── folders/[id]/route.ts     # PATCH/DELETE
│       ├── folders/reorder/route.ts  # PATCH(並び替え)
│       ├── tags/route.ts             # GET/POST/PATCH/DELETE
│       ├── export/route.ts           # GET(全件JSON)
│       └── metadata/route.ts         # GET(OGP自動取得)
├── components/
│   ├── FilterBar.tsx          # 検索・フィルター・並び替えUI
│   ├── ResizableSidebar.tsx   # 可変幅サイドバー（PC）
│   ├── ThemeToggle.tsx        # ライト/ダーク切り替え
│   ├── items/
│   │   ├── ItemTable.tsx      # 一覧テーブル（D&D対応）
│   │   └── ItemForm.tsx       # 登録・編集フォーム（自動取得ボタン含む）
│   ├── folders/
│   │   ├── FolderPanel.tsx        # フォルダ一覧・作成・改名・削除・並び替え
│   │   └── CreateFolderDialog.tsx # D&Dで新規フォルダ作成する確認ダイアログ
│   ├── tags/TagPanel.tsx      # タグ管理UI
│   └── ui/                    # shadcn/uiの生成コンポーネント
├── lib/
│   ├── kv/{items,folders,tags}.ts  # データ層（Cloudflare KV操作の本体）
│   ├── auth/verify.ts              # getUser()検証 + Cache API
│   ├── supabase/{client,server,middleware}.ts  # Supabaseクライアント
│   ├── api/client.ts           # フロント用フェッチラッパー（認証ヘッダー付与）
│   ├── ai-tool-detect.ts       # URLホスト名からAIツール名判定
│   └── constants.ts            # AI_TOOL_PRESETS, FOLDER_NAME_MAX_LENGTH等
├── proxy.ts                    # Next.js 16のmiddleware（セッションCookie更新）
└── types/cloudflare-cache.d.ts # `caches.default`の型補完

plan.md       # 全設計判断・トレードオフの詳細（章立て、随時更新中）
wrangler.jsonc      # Cloudflareバインド設定（KV, Assets, Images等）
.dev.vars(.example) # サーバー用env（gitignore対象、実体は手動設定）
.env.local(.example)# クライアント用env（同上）
```

## 4. 次にやるべきタスク

### 本命: Jina Reader APIを使ったタイトル・本文自動取得の刷新

**背景**: 現状の`/api/metadata`は単純な`fetch()` + OGPタグ解析のみで、ChatGPT/Claude/Geminiのような**JS描画のSPA**では本文（チャット内容）を一切取得できない（plan.md 5.6章に実URL検証結果あり）。[Jina Reader](https://jina.ai/reader/)（`https://r.jina.ai/<URL>`にアクセスすると、対象ページを実際にレンダリングしてLLM向けのクリーンなテキスト/Markdownを返してくれるサービス）を使えば、この制約を回避できる可能性がある。

**次のセッションで検討・実装すべきこと**:
1. Jina Readerの仕様確認（無料枠の有無、レート制限、APIキーの要否、レスポンス形式）
2. `/api/metadata`（またはそれに代わる新エンドポイント）で、Jina Reader経由の取得を試す設計に変更
   - 既存のOGP直接取得ロジック（`src/app/api/metadata/route.ts`）とどう共存させるか（Jina優先+OGPフォールバック？ ユーザーが選べるように？）
   - Jina Readerは外部サービスへの都度リクエストになるため、レイテンシ増加・障害時のフォールバック設計が必要
   - 既存のSSRF対策（プライベートIPブロック等、`src/app/api/metadata/route.ts`参照）は、Jina Reader自体がURLを取得する構成になる場合は意味が変わる点に注意
3. **KV検索の実装**: 現状、検索は「一覧取得を1回行った後は全部クライアント側で処理」という設計（plan.md 5.7章、Auth検証込みAPIを毎キー入力で叩くのを避けるため）。indexには本文の**先頭300文字のスニペットのみ**（`contentSnippet`、`src/lib/kv/items.ts`の`CONTENT_SNIPPET_LENGTH`）を持たせている。Jina Readerで本文がより長く・正確に取得できるようになった場合、
   - 300文字スニペットのままで足りるか、それとも本文全文を検索対象にする必要があるか
   - 全文検索が必要なら、indexへの格納方法（肥大化トレードオフ、plan.md 5.3章参照）かサーバー側検索（都度KVから個別取得）のどちらにするか
   - という設計判断が必要。**ここは一度立ち止まって設計を詰めてから実装することを推奨**（このセッションでも同様の理由で「クライアント側フィルタリング」を選んだ経緯があるため、同じトレードオフを再考することになる）。

### その他残っているタスク（plan.md参照）
- **ステップ7 (PWA/共有機能)**: `manifest.json`、Android Web Share Target、iOS用「ペースト」ボタン運用。未着手。
- **実デプロイ未検証**: `npm run deploy`（`opennextjs-cloudflare build && deploy`）でのCloudflare Pagesへの実デプロイは一度も行っていない。ローカルの`next dev`と実際のWorkersランタイムでは挙動差がある既知の例が複数あるため（`caches`の有無、`process.env`の扱い等）、デプロイ後の動作確認が必要。
- **LINE/Appleログイン**: 初期スコープ外として後回し（plan.md 4.1章）。
- **自動テスト**: 現状ゼロ。全ての動作確認は一時的なブラウザ用デバッグページ（`src/app/dev-test/`を都度作って削除）で行ってきた。

### 環境について
- Cloudflareアカウントへの`wrangler login`はこのマシンでは完了済み（`dev2logging@gmail.com`）。KV Namespace（`LINKS_KV`, ID: `wrangler.jsonc`参照）も作成済み。
- Supabaseプロジェクトの実際のURL/anon keyは`.dev.vars`と`.env.local`にローカル設定済み（値そのものはこのドキュメントには記載しない。gitにも含まれない）。
- 開発サーバー起動: `npm run dev`。ビルド確認: `npm run build && npm run lint`。
