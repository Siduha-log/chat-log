# AI共有リンク一元管理PWAアプリ 実装計画

## 1. 概要と目的

各種AI（Gemini, ChatGPT, Claude, DeepSeek等）の「チャット共有URL」を、スマホの共有シートやPCブラウザから素早く保存・整理・検索できるPWA。GitHubへの`git push`をトリガーにCloudflare Pagesへ自動デプロイする。

**規模の前提**: 個人〜少数人利用。この前提が、以下の設計判断（特にデータ層の選択）の根拠になっている。規模が大きく変わる場合は 8章「既知のトレードオフ」を再検討すること。

## 2. アーキテクチャ全体図

```
┌────────────┐        ①ログイン         ┌──────────────────┐
│  ブラウザ /  │ ───────────────────────▶│  Supabase Auth    │
│   PWA       │◀─────────────────────── │ (Google/GitHub/X/  │
└─────┬──────┘   アクセストークン発行      │  メール認証)        │
      │                                  └──────────────────┘
      │ ②API呼び出し                                ▲
      │  Authorization: Bearer <token>              │ ③ getUser()でリモート検証
      ▼                                              │   (Cache APIで短時間キャッシュ)
┌─────────────────────────────────────────────────────┐
│  Cloudflare Pages Functions (@cloudflare/next-on-pages)│
│  - /api/items  (CRUD)                                  │
│  - /api/export (全件JSON出力)                           │
└─────┬───────────────────────────────────────────────┘
      │ ④データ読み書き
      ▼
┌────────────────────────────────────────────┐
│  Cloudflare KV                               │
│  - user:{user_id}:items:{item_id}  (本体)     │
│  - user:{user_id}:index            (検索用)   │
└────────────────────────────────────────────┘
```

## 3. 技術スタック

| 領域 | 選定 | 備考 |
|---|---|---|
| Framework | Next.js (App Router) | `@cloudflare/next-on-pages` アダプタで動作（**静的export不可**。API RoutesとSSR/Edge実行が必須のため） |
| Styling | Tailwind CSS, shadcn/ui | ビルドサイズへの影響を要監視（8章参照） |
| Auth | Supabase Auth | 認証専用。DBは使わない |
| データ層 | Cloudflare KV | コスト・実装シンプルさ優先。トランザクション非対応というトレードオフを許容（8章） |
| Hosting | Cloudflare Pages | GitHub連携による自動デプロイ |

## 4. 認証設計

### 4.1 対応方式（初期版）

- メール/パスワード
- Google
- GitHub
- X（Supabaseの新OAuth 2.0プロバイダ。`signInWithOAuth({ provider: "x" })`。2026年2月に追加された新プロバイダで、旧来の`"twitter"`（OAuth 1.0a、レガシー扱い）とは別物なので注意）

**後回し（初期スコープ外）**: LINE（Supabase標準プロバイダ非対応、カスタムOAuth設定が必要）、Apple（有料Developer Program加入・ドメイン検証が前提）。将来対応する場合は別途タスク化する。

### 4.2 Cloudflare Functions側でのuser_id検証

Cloudflare Pages FunctionsとSupabase Authは別プラットフォームであるため、クライアントが送ってきた`user_id`をそのまま信用してはならない（なりすまし防止）。

- クライアントは全APIリクエストに `Authorization: Bearer <access_token>` を付与する。
- Functions側は受け取ったトークンを **Supabase `getUser()` をサーバーサイドから呼んでリモート検証** し、返ってきた`user_id`のみを信用する。
  - JWT自前検証（jose等で署名検証）は鍵管理の複雑さを避けるため採用しない。
- **キャッシュ**: Cloudflare Pages Functionsはリクエストごとにステートレスなため、毎回のリモート検証はSupabase Auth APIのレート制限・レイテンシに影響する。**Cloudflare Cache API** にトークンハッシュをキーとして検証結果を短時間（例: 60秒）保存し、同一トークンでの連続リクエストではAuth API呼び出しを省略する。
  - Cache APIはリージョン間の共有保証が弱い点を理解した上で使う（キャッシュミス時は素直にAuth APIを呼ぶフォールバックとして設計）。

### 4.3 環境変数の二重管理（実装時に判明した注意点）

OpenNext Cloudflareアダプタ環境下では、環境変数の置き場所が**アクセス元によって異なる**。

| 変数の用途 | 置き場所 | アクセス方法 |
|---|---|---|
| サーバー側（middleware/proxy, Route Handler, Server Component） | `.dev.vars`（ローカル）/ Cloudflareダッシュボードの環境変数（本番） | `getCloudflareContext().env.X`（`process.env.X`ではない） |
| ブラウザ側（Client Componentの`NEXT_PUBLIC_*`） | `.env.local`（ローカル）/ Cloudflare Pagesのビルド環境変数（本番） | `process.env.NEXT_PUBLIC_X`（Next.jsのビルド時に静的置換） |

`NEXT_PUBLIC_SUPABASE_URL`等は**両方に重複して**設定する必要がある。`.dev.vars`だけに書いてもブラウザ側バンドルには反映されない（Next.jsのクライアントバンドル生成は`.env*`系ファイルしか見ないため）。テンプレートは`.dev.vars.example`と`.env.local.example`を参照。

## 5. データ設計（Cloudflare KV）

### 5.1 キー構成

| キー | 内容 | 用途 |
|---|---|---|
| `user:{user_id}:items:{item_id}` | アイテム本体（全フィールド） | 詳細取得・編集・削除 |
| `user:{user_id}:index` | 全アイテムの軽量メタデータ一覧（JSON配列） | 一覧表示・リアルタイム検索・タグフィルター |

### 5.2 アイテムのフィールド

```json
{
  "id": "uuid",
  "title": "string",
  "shareUrl": "string",
  "contentText": "string",
  "memo": "string",
  "tags": ["string"],
  "folderId": "uuid | null",
  "aiTool": "string",
  "favorite": "boolean",
  "createdAt": "ISO8601"
}
```

indexエントリ（一覧・検索用の軽量版）は`contentText`全文の代わりに、先頭300文字だけの`contentSnippet`を持つ（検索対象に含めつつindexの肥大化を避けるため。5.6章参照）。

### 5.3 既知のトレードオフ（許容済み）

- `index`キーは1ユーザー1キーの単一JSONのため、複数端末からの同時書き込みでread-modify-write競合が起こりうる（後勝ちで一部更新が消える可能性）。
- `item`本体と`index`は別々のKV書き込みのため、片方のみ失敗する部分失敗が起こりうる（トランザクション非対応）。
- `folders`キー（5.4章）・`tags`キー（5.5章）も同じ「1ユーザー1キーのJSON配列」方式であり、同じ競合リスクを持つ。
- タグのリネーム/削除は複数アイテムへのカスケード更新を伴うが、これを`Promise.all`でitemごとに独立した`updateItem()`として並列実行すると、indexキーへの書き込みが競合しほぼ確実に一部の更新が失われる。そのため専用の`bulkUpdateItemTags()`（[src/lib/kv/items.ts](src/lib/kv/items.ts)）で「個別アイテムキーは並列・indexキーは最後に1回だけ書き込む」ようにしている。
- **対応方針**: 個人〜少数人利用の前提でリスクを許容し、自動復旧の仕組みは作らない。不整合が疑われる場合は手動確認・再同期で対応する（将来、整合性チェック用のメンテナンススクリプトを検討してもよい）。

### 5.4 フォルダ機能

リンクをフォルダ分けできるようにする。`parentId`による木構造（親フォルダを持たない場合は`parentId: null`）。フラット運用したい場合は全フォルダの`parentId`を`null`のままにすればよい。

**キー**: `user:{user_id}:folders` — 全フォルダのJSON配列（5.1のindexと同じ「軽量な単一キー」方式）。

```json
{
  "id": "uuid",
  "name": "string",
  "parentId": "uuid | null",
  "order": "number",
  "createdAt": "ISO8601"
}
```

- アイテムの`folderId`は未所属時`null`。フォルダ作成/移動時に親の存在チェック、および移動先が自分自身の子孫にならないかの循環チェックを行う（[src/lib/kv/folders.ts](src/lib/kv/folders.ts)の`wouldCreateCycle`）。
- **削除ポリシー**: 子フォルダまたは所属アイテムが残っているフォルダは削除不可（409を返す）。サイレントなカスケード削除・孤児化を避けるため。UIでは「中身を先に移動/削除してください」という導線が必要。
- **並び順**: `order`フィールドによる任意の並び替え（UIの▲▼ボタン→`PATCH /api/folders/reorder`）に加え、名前順表示も選べる（クライアント側でソート）。

### 5.5 タグ機能

タグはアイテムには文字列配列（`tags: string[]`）としてそのまま持たせる一方、ユーザーが使える「既知のタグ一覧」を`user:{user_id}:tags`（文字列配列）として別管理する。

- 初回アクセス時にデフォルトタグ`["調査", "相談", "計画"]`を遅延シードする（[src/lib/kv/tags.ts](src/lib/kv/tags.ts)）。これによりデフォルトタグもカスタムタグと同じAPIでリネーム・削除できる。
- **リネーム**: タグ登録一覧の名称を変更し、そのタグが付いている全アイテムにもカスケードする（5.3章のbulkUpdateItemTags経由）。
- **削除**: タグ登録一覧から削除し、付与されている全アイテムからも取り除く（ゾンビタグを残さないため）。

### 5.6 URL自動メタデータ取得（OGP + Jina Reader）

共有URL入力時に、タイトル・本文・AIツール名を自動取得できるようにする。

- **技術的制約**: ChatGPT/Claude/Gemini等の共有ページはJSで本文を描画するSPAが大半で、サーバー側の単純`fetch()`では本文（チャット内容）は取得できない。一方`<meta property="og:title">`等のOGPタグはSNSプレビュー用にサーバー側で埋め込まれていることが多く、これは確実に取得できる。
- **Jina Reader (`https://r.jina.ai/<URL>`) の採用**: 対象URLを実際にヘッドレスブラウザでレンダリングしてからクリーンなMarkdownを返してくれる外部サービス。OGP直接fetch（タイトル取得用、[src/app/api/metadata/route.ts](src/app/api/metadata/route.ts)の`fetchOgpMeta`）と並行実行するハイブリッド構成にし、本文取得はJina側が担当する（`fetchJinaContent`）。APIキー無しで20回/分、無料キー登録で500回/分・トークン付与ありに緩和される（`JINA_API_KEY`環境変数、任意）。
- **サービスごとの実測結果と運用方針**（2026-09-16、実URLで検証）:
  - **ChatGPT**: タイトル（`<title>`タグ経由）・本文ともに高い確率で安定して取得できる。**現状維持で完了とする**。
  - **Claude**: 本文は安定して取得できるが、タイトルはページのどこにも存在しない（`Title:`欄も`<title>`タグも固定で`"Claude"`という**修正不可能な既知の限界**）。次善策として、Jinaが変換した最初の発言見出し「`## You said: <発言冒頭>`」を疑似タイトルとして抽出する（`extractHeadingTitle`）。これでも拾えない場合はOGPタイトルにフォールバックし、それも無ければ手動修正を促す。
  - **Gemini**: `share.gemini.google/xxx`→`gemini.google.com/share/<id>?skid=...`にリダイレクトされる上、JS描画が重く**確率的に**ログイン画面のガワ（`[Sign in](https://accounts.google.com/ServiceLogin?...)`だけの数百文字）しか返らないことがある。`X-Timeout: 30`と、Gemini固有のDOM要素名`chat-app-orchestrator`を指定した`X-Wait-For-Selector`を試したが、これでも解消しない確率的な失敗が残ることを実URL検証で確認した。**このため全自動取得の完璧化はここで打ち止め（損切り）とし、失敗時はユーザーが会話のやり取りをコピーして本文欄に手動貼り付けする運用でカバーする方針**とした。手動貼り付けされた本文も、他の取得経路と全く同じく1万文字保存・サーバー全文検索の対象になるため、検索体験自体は取得経路によらず担保される（5.6.1章）。
  - **重要な既知の不具合**（実装時に発見・修正済み）: `X-Wait-For-Selector`はGemini固有のDOM要素名を指定しているため、これをChatGPT/Claudeにも一律で送ると存在しないセレクタを待ち続けて`X-Timeout`いっぱい（30秒）ハングする不具合を実URL検証で再現した。そのため**`aiTool === "Gemini"`の場合にのみこのヘッダーを付与する**よう限定している（`fetchJinaContentOnce`）。
  - **レンダリング未完了の検出（ゴミ判定）**: `looksLikeRenderFailure()`で「200文字未満」「本文中に`accounts.google.com/servicelogin`を含む（文字数によらず常時）」「3000文字未満かつ`"something went wrong"`等の定型文言を含む」のいずれかに該当する場合は取得失敗として扱い、`contentText`には採用しない。該当した場合は1回だけ自動リトライし、それでも失敗なら諦めてOGPフォールバックにも頼らず、フォーム側に「※本文の自動取得に失敗しました」という明示的な通知を出す（`src/components/items/ItemForm.tsx`）。中途半端な低品質データを黙って保存するより、失敗を明示して手動入力を促す方を優先した。
- **AIツール名判定**: URLホスト名から判定する（[src/lib/ai-tool-detect.ts](src/lib/ai-tool-detect.ts)）。ネットワーク不要でURL入力時に即時反映され、フォームの「自動取得」ボタンでもOGP/Jina取得と同時に反映される。
- **エンドポイント**: `GET /api/metadata?url=...`（[src/app/api/metadata/route.ts](src/app/api/metadata/route.ts)）。
- **SSRF対策**: OGP直接fetchパスのみ、http/https以外のスキームを拒否、リテラルなプライベート/ループバックIP（127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x, localhost等）を拒否、取得タイムアウト8秒、`</head>`検出時点または最大300KBで読み込み打ち切り。Jina Reader経由のfetchは対象URLをJina側が取得する構成のため、この対策の対象外（我々のサーバーから直接プライベートIPに到達するリスクが無いため）。
  - **既知の限界**: ドメイン名が後からプライベートIPを指すよう変化するDNSリバインディング攻撃までは防げない。個人利用の単一ユーザー向けツールとして許容する（他ユーザーのデータや共有インフラへの影響がないため）。将来的に複数ユーザーでの本格運用を想定する場合は再検討が必要。
- **保存時の上限**: 本文は`CONTENT_MAX_LENGTH`（1万文字、[src/lib/constants.ts](src/lib/constants.ts)）でクリップしてから保存する。自動取得・手動貼り付けのどちらの経路でもAPI層（`/api/items`のPOST/PATCH）で一律クリップされる。

#### 5.6.1 サーバー全文検索

一覧のindex（`user:{id}:index`）が持つ`contentSnippet`は本文先頭300文字のみのため、本文の奥の方にしか出てこないキーワードは従来のクライアント側フィルタでは検索できなかった。これを補うため、`GET /api/search?q=...`（[src/app/api/search/route.ts](src/app/api/search/route.ts)）を新設した。

- 該当ユーザーの全アイテムを個別キーから`getItem()`でフェッチし、`contentText`全文に対して一致するものだけをidで返す素朴な実装。候補の事前絞り込みや部分キャッシュは行わない（5.3章のKVレイヤーのトレードオフ許容方針と同じ理由で、個人利用規模では過剰最適化と判断）。
- クライアント側（[src/app/page.tsx](src/app/page.tsx)）は検索クエリ入力から400msデバウンスしてこのAPIを呼び、結果を既存のタイトル/メモ/タグ/AIツール/スニペットによる瞬時のクライアント側フィルタにOR条件で上積みする。サーバー検索が失敗しても、既存の瞬時フィルタ結果はそのまま表示され続ける（サイレントフォールバック）。
- 自動取得・手動貼り付けのどちらで入った本文でも、保存されている`contentText`全体が等しく検索対象になるため、取得経路による検索体験の差は無い。

### 5.7 API実装メモ（実装時に判明した注意点）

- `caches`（Cloudflare Cache API、4.2章のgetUser()結果キャッシュに使用）は**実際のWorkersランタイム（本番 / `opennextjs-cloudflare preview`）でのみ存在**し、素の`next dev`には存在しない。`typeof caches !== "undefined"`でフィーチャー検出し、存在しない場合はキャッシュなしでAuth APIを直接呼ぶフォールバックにしている（[src/lib/auth/verify.ts](src/lib/auth/verify.ts)）。
- Next.js App Routerはアンダースコアプレフィックスのフォルダやファイルをルーティングから除外する（`_folder`は404になる）。テスト用ルートを置く際は要注意。
- 検索・フィルター・並び替えはAPIを叩き直さず、**一覧取得を1回行った後は全てクライアント側（ブラウザ）で処理**している（[src/app/page.tsx](src/app/page.tsx)）。キー入力のたびにAuth検証込みのAPIを叩くのを避けるための設計判断。
- OGP取得時のUser-Agentは`Mozilla/5.0 (...) Chrome/...`という一般的なブラウザ文字列を使う。Bot名乗りのUser-Agent（例: `AiLinkManagerBot/1.0`）だと、Bot対策のあるサイトから403やチャレンジページを返され、OGPタグを含まない結果になることを実地で確認した（例: perplexity.aiはCloudflareのチャレンジページで403）。
- `<meta>`タグは個別に切り出してから`property`/`name`と`content`をそれぞれ別の正規表現で読み取ることで、属性の記述順序に依存しないようにしている（[src/app/api/metadata/route.ts](src/app/api/metadata/route.ts)の`collectMetaTags`）。
- **実際の共有URLでの検証結果（OGP直接fetchのみだった時点、2026-09-15）**: Claude/ChatGPT/Geminiそれぞれの挙動を確認した記録。**Jina Reader導入後の最新の結論は5.6章を参照**（特にGeminiの`HeadersOverflowError`は、Jina Reader経由に切り替えたことで別のアプローチとなり本文取得自体は可能になったが、代わりに確率的な描画未完了という新たな既知の限界が判明した）。
  - **Claude** (`claude.ai/share/...`): og:title/descriptionともに`"Claude"`/`"Shared via Claude, an AI assistant from Anthropic"`という固定の汎用文言。`<title>`タグも同様に`"Claude"`のみで、会話固有の情報はHTML内のどこにも存在しない。**修正不可能な既知の限界**（ヘッドレスブラウザでのJS実行が必須）。
  - **ChatGPT** (`chatgpt.com/share/...`): og:title/twitter:titleは`"このチャットを見てみる"`という汎用招待文言だが、`<title>`タグには`"ChatGPT - <実際の会話タイトル>"`という会話固有の情報が入っている。**そのためChatGPTのみog:titleより`<title>`タグを優先する**よう分岐している（[src/app/api/metadata/route.ts](src/app/api/metadata/route.ts)）。
  - **Gemini** (`share.gemini.google/...`→`gemini.google.com/share/...`にリダイレクト): 当時はNode.js標準fetch実装（undici）のヘッダーサイズ上限を超え`HeadersOverflowError`で取得自体が失敗していた。

### 5.8 実装済みAPIエンドポイント

| エンドポイント | メソッド | 内容 |
|---|---|---|
| `/api/items` | GET | 一覧取得（`?folderId=`でフィルタ、`unfiled`で未所属のみ） |
| `/api/items` | POST | 新規作成 |
| `/api/items/[id]` | GET / PATCH / DELETE | 詳細取得・更新（`folderId`での移動含む）・削除 |
| `/api/export` | GET | 全件JSONエクスポート（5.9章方式(A): エクスポート時に個別キーを全件フェッチ） |
| `/api/folders` | GET / POST | フォルダ一覧・作成 |
| `/api/folders/[id]` | PATCH / DELETE | リネーム・移動・削除（中身は未分類化、子フォルダが残っている場合のみ409） |
| `/api/folders/reorder` | PATCH | 任意の順序への並び替え |
| `/api/tags` | GET / POST / PATCH / DELETE | タグ一覧・追加・リネーム（カスケード）・削除（カスケード） |
| `/api/metadata` | GET | URLからタイトル（OGP/Jina Reader）・本文（Jina Reader）・AIツール名を取得 |
| `/api/search` | GET | `?q=`で本文全文一致検索（idのみ返す、5.6.1章） |
| `/api/items/bulk` | PATCH | `{ids, patch}`で複数アイテムへ同一patchを一括適用（5.10章） |
| `/api/folders/delete-empty` | DELETE | 空フォルダ（中身のアイテムも子フォルダも無いもの）を一括削除 |
| `/api/account` | DELETE | アカウント削除。KV全データ削除＋Supabase Authユーザー削除（5.11章） |

全エンドポイントは`Authorization: Bearer <access_token>`必須（4.2章のgetUser()検証）。フォルダ名は30文字以内（`FOLDER_NAME_MAX_LENGTH`、サーバー・クライアント両方でバリデーション）。クライアント側はIME変換中に`maxLength`属性が効かないことがあるため、`onChange`側でも明示的に文字数をクリップしている。

### 5.9 エクスポート機能

「全データをJSONダウンロード」には`contentText`や`memo`を含む全フィールドが必要。indexにはメタデータしかない前提のため、以下のいずれかで対応する。

- **(A) 採用**: エクスポート実行時のみ、indexから全item_idを取得し、各itemキーを個別フェッチして組み立てる（[src/lib/kv/items.ts](src/lib/kv/items.ts)の`exportAllItems`）。
- (B) indexに全フィールドを内包する形に変更する（一覧表示用データが重くなるため不採用）。

### 5.10 D&Dフォルダ作成の競合バグと修正

テーブルの行同士をD&Dして新規フォルダを作成する機能で、時々片方のアイテムだけフォルダが反映されない不整合が発生していた。原因は`handleConfirmMerge`（[src/app/page.tsx](src/app/page.tsx)）が2件のアイテムへの`folderId`更新を`PATCH /api/items/[id]`の`Promise.all`で並列実行しており、それぞれが`updateItem()`内で共有indexキー（`user:{userId}:index`）に対して非アトミックなread-modify-writeを行うため、**後勝ちで片方の更新がindexから消えていた**（個別アイテムキー自体は正しいため、一覧表示とAPIの結果がズレるという分かりにくい形で現れる）。

修正: 複数アイテムへの一括patch用に既にあった`bulkUpdateItems()`（5.2章、indexへの書き込みを最後に1回だけにまとめる設計）をHTTP経由で呼べる`PATCH /api/items/bulk`を新設し、`handleConfirmMerge`はこれを1回呼ぶだけに変更した。あわせて、フォルダ作成後の割り当て失敗時のエラーハンドリング（`try/catch`+alert、既存の`handleDeleteFolder`と同じパターン）と、`CreateFolderDialog`の入力欄が対象ペア変更時にリセットされない不具合（`key`propで強制リセット）も修正した。

### 5.11 空フォルダ一括削除・アカウント削除

- **空フォルダ一括削除**: `deleteEmptyFolders()`（[src/lib/kv/folders.ts](src/lib/kv/folders.ts)）が、中身のアイテムが1つも無く子フォルダも持たないフォルダをまとめて削除する。個別削除（`deleteFolder`）と同じ「子フォルダが残っている場合は対象外」制約を踏襲。サイドバーのフォルダ一覧末尾にボタンとして表示（0件のときは非表示）。
- **アカウント削除**: `DELETE /api/account`で、KV全データ（アイテム・フォルダ・タグ・index。`deleteAllItems`/`deleteAllFolders`/`deleteAllTags`）を先に削除し、その後Supabase Authの`auth.admin.deleteUser()`でユーザー自体を削除する。
  - **service_role keyの追加**: `auth.admin.deleteUser()`はSupabaseの管理者API（Admin API）であり、anon keyでは呼び出せず**service_role key**（RLSを全てバイパスする強力な管理者権限キー）が必須。新規に`SUPABASE_SERVICE_ROLE_KEY`環境変数を追加し（`JINA_API_KEY`と同じ`.dev.vars`運用パターン）、専用の管理者クライアント（[src/lib/supabase/admin.ts](src/lib/supabase/admin.ts)）を他のSupabaseクライアント（anon key）とは完全に分離して新設した。ローカルでの動作確認にはユーザー自身がSupabaseダッシュボード（Project Settings > API）から値を取得して`.dev.vars`に設定する必要がある。
  - **削除順序の設計判断**: KVデータ削除→Auth削除の順にした。逆順だとAuth削除成功後にKV削除が失敗した場合、ユーザーはログインすらできずエラーを提示する手段が無くなる。KVを先に消せば、Auth削除が失敗してもログインしたままエラーメッセージを表示できる（非破壊的な失敗モードを優先）。
  - 設定UI（歯車アイコン＋モーダル、[src/components/SettingsButton.tsx](src/components/SettingsButton.tsx) / [SettingsDialog.tsx](src/components/SettingsDialog.tsx)）はサイドバー左下に配置。確認は既存の`window.confirm`パターンを踏襲。

## 6. PWA / 共有機能（実装済み、2026-09-16）

### 6.1 Android

`src/app/manifest.ts`（Next.js App RouterのFile-based Metadata、`/manifest.webmanifest`で自動配信）の`share_target`でWeb Share Targetに対応し、共有シートから`/share`ルート（[src/app/share/route.ts](src/app/share/route.ts)）でURLを受け取る。

- `share_target`は`method: "GET"`、`params: {title, text, url}`。ファイル共有は不要なためPOST/multipart構成にはしていない。
- 共有元アプリによっては`url`パラメータを使わず`text`の自由文中にURLを埋め込んでくることがある（実際のAndroidアプリの共有挙動を踏まえた対応）ため、`url`が空なら`text`から`https?://\S+`の最初のマッチを拾うフォールバックを入れている。
- `/share`は受け取ったURLをそのままKVに保存せず、`/?shareUrl=<encoded>`へリダイレクトするだけにする（無条件保存はUXとして唐突なため、既存の「フォームで自動取得ボタンを押してから保存」という流れに乗せる）。
- **未ログイン時の考慮**: `/share`でセッションが無い場合は`/login?next=<encoded target>`へリダイレクトする。`src/app/auth/callback/route.ts`は元々`next`パラメータに対応済みだったが、呼び出し元（`src/app/login/page.tsx`のOAuth/メールログイン）がこれまで渡していなかったため、`getNextPath()`ヘルパーを追加してOAuth(`redirectTo`)・メールログイン双方の成功後リダイレクト先に反映した。
- `src/app/page.tsx`側は、認証確認後に一度だけ`window.location.search`の`shareUrl`を読み、`pendingShareUrl` stateにセットして新規登録フォームを自動的に開く（`ItemForm`の`initial.shareUrl`に渡す）。読み取り後は`history.replaceState`でURLからクエリを消し、リロード時の再トリガーを防ぐ。

### 6.2 iOS

iOS SafariはWeb Share Target非対応。**自動クリップボード検知は行わない**（`navigator.clipboard.readText()`のユーザージェスチャー制約・許可ダイアログの問題を避けるため）。代わりに、`ItemForm`の共有URL欄に明示的な「📋 貼り付け」ボタンを用意し（[src/components/items/ItemForm.tsx](src/components/items/ItemForm.tsx)の`handlePasteUrl`）、ボタン押下時にクリップボードから読み取る。失敗時（権限拒否・API非対応等）は`try/catch`で吸収し、標準のペースト操作への案内文言を出すだけでアプリは壊れない。

### 6.3 タグ

デフォルトタグ: 「知識」「相談」「計画」。ユーザーによるカスタム追加・編集に対応。

### 6.4 アイコン・スコープ外にした点

- アイコンは`public/icon.svg`1枚（角丸正方形＋白文字「AI」、テーマカラー`#5c8aae`）のみで対応した。`next/og`のImageResponse等による実行時PNG生成は、OpenNext/Cloudflare Workers環境での動作実績が無く検証コストが高いため採用しなかった。SVGはAndroid Chromeのインストールプロンプトでは問題なく使えるが、iOSの`apple-touch-icon`はSVG非対応のためSafariが無視しデフォルト挙動にフォールバックする（実害は無いが、**将来的に実際のブランドアイコン（PNG）を用意することが望ましい**、現状はプレースホルダー）。
- **Service Worker / オフラインキャッシュは実装しない**（意図的なスコープ外）。認証込みAPI経由のCRUDが前提のアプリでオフラインにできることが実質無く、Cloudflare/OpenNext環境での導入実績も無いため。

## 7. 実装ステップ

1. **プロジェクト初期化**
   - Next.js (App Router) + `@cloudflare/next-on-pages` セットアップ
   - Tailwind CSS, shadcn/ui 導入
   - **ビルドしてCloudflare Pages Functionsのスクリプトサイズ上限を確認する**（Supabase SDK + shadcn/uiを積んだ状態で無料枠に収まるか。超過時は依存の軽量化 or 有料プラン移行を検討）
2. Supabase プロジェクト作成、Auth設定（メール/Google/GitHub/X）
3. Cloudflare KV Namespace作成、Pages側でバインド設定
4. 認証フロー実装（ログイン画面、セッション取得、`getUser()`検証 + Cache APIキャッシュ）
5. API実装（`/api/items` CRUD、`/api/export`）
6. データ登録・一覧・検索・タグフィルターUI実装
7. PWA manifest・共有ターゲット（Android）・ペーストボタン（iOS）実装
8. JSONエクスポート機能実装
9. GitHub連携によるCloudflare Pages自動デプロイ設定
10. 動作確認（Android実機での共有シート、iOS実機でのペーストボタン、複数端末同時操作での挙動確認）

## 8. デプロイ手順（実施済み、2026-09-16）

初期構想では「Cloudflare Pagesダッシュボードでのプロジェクト連携」を想定していたが、実際には`next-on-pages`から`@opennextjs/cloudflare`へ移行した経緯（1章参照）により、**実体はCloudflare Pagesではなく素のCloudflare Worker**（`wrangler.jsonc`の`main`指定によるデプロイ）になっている。GitHub連携による自動デプロイは組んでおらず、`npm run deploy`（`opennextjs-cloudflare build && opennextjs-cloudflare deploy`、内部で`wrangler deploy`相当を実行）をローカルから手動実行する運用。

- **本番URL**: https://ai-link-manager.dev2logging.workers.dev （2026-09-16時点。後に`chathub-app`へ移行、10章参照）
- **KV Namespaceのバインド**: `wrangler.jsonc`に`id`（本番）と`preview_id`（`wrangler dev`用）が最初から設定済みのため、追加設定不要。
- **環境変数/Secretsの設定**: `wrangler secret put <NAME>`で以下4つを設定済み（`.dev.vars`の値をそのまま使用、コマンド実行時に値を標準入力からパイプする形で、値自体がターミナル出力やコマンド履歴に残らないようにした）。
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `JINA_API_KEY`
  - （4つとも`NEXT_PUBLIC_`系も含めsecretとして統一管理している。Supabase URL/anon keyは本来publicな値だが、`wrangler.jsonc`に平文`vars`として書くより秘密管理を一本化する方がシンプルなためsecretに寄せた）
- **Windows特有の既知の問題**: `opennextjs-cloudflare build`は`.open-next`ディレクトリを再作成するため、ローカルの`next dev`（`initOpenNextCloudflareForDev()`により同ディレクトリのファイルを開いたまま保持する）を起動したままデプロイを実行すると`EPERM`で失敗する。**デプロイ前に`next dev`のプロセスを終了させておくこと。**
- **デプロイ後の疎通確認結果**（curl、認証不要な範囲）: `/`・`/login`・`/manifest.webmanifest`・`/icon.svg`が正常応答、`/share`が期待通り`/login?next=...`にリダイレクト、`/api/items`が未認証・不正トークンともに正しく`401`（＝Supabaseクライアント初期化とCache APIが本番Workersランタイムでクラッシュしていないことの間接確認）。実際のログイン・CRUD・Jina Reader呼び出し・アカウント削除・Android/iOS実機確認は次回実施（HANDOVER.md 4章参照）。

## 9. 今後の検討事項（初期スコープ外）

- LINE / Apple ログイン対応
- KVの不整合が実際に問題化した場合のD1移行検討
- エクスポート方式(A)/(B)の最終選定

## 10. Ver0.0リリースまでの追加改修（2026-09-16、本番デプロイ後）

8章のデプロイ完了後、実機テストで見つかったUI/UX課題とAndroid実機固有の問題への対応を行い、Ver0.0として開発完了した。

### 10.1 UI/UX改善
アプリ名を「AI Link Manager」から「ChatHub」に統一。加えて、検索・フィルターエリアのアコーディオン化（検索ボックスは常時表示、詳細フィルターのみ開閉式＋絞り込み適用中バッジ）、一覧のページネーション（1ページ20件、Google検索風UI）、モバイル用ハンバーガーボタンの44px化、タイポグラフィの階層調整（見出し/本文/キャプションのメリハリ）、文字サイズ設定（小/中/大、`globals.css`の`--font-scale`でTailwindの`--text-*`トークンを一括calc()スケールする方式。remベースのpadding/gapとは独立して文字サイズだけを変えられる）、テーマの初期表示をライトモード固定化（従来はOSの`prefers-color-scheme`に追従していた）を実施。

### 10.2 PWAアイコンのAndroid WebAPKキャッシュ固着問題
新しいアプリアイコン（`public/icon.png`）に差し替えたが、Pixel実機で「PWAをホーム画面に追加し直してもアイコンが更新されない」問題が発生した。これはAndroid Chromeが生成する**WebAPK**（Web App相当のネイティブラッパー）が、`manifest.json`の内容やアイコン画像をキャッシュし、更新の検知・反映が非常に固着しやすいという既知の癖に起因する。

複数の対策を段階的に試した経緯:
1. アイコンURLへのキャッシュ破棄用クエリ付与（`/icon.png?v=2`）
2. `manifest.json`の`icons`の`sizes`/`purpose`を実画像に正確に合わせる調整
3. `id`/`start_url`/`name`へのバージョン標付与（Google WebAPKサーバーに「別アプリ」と認識させる意図）
4. **Workerを`ai-link-manager`から`chathub-app`へ完全に新規ドメイン移行**（`wrangler.jsonc`の`name`・self-reference service bindingを変更。KV Namespaceは同一idのため既存データは引き継がれる。Secretsは新Workerに再設定が必要だった）
5. アイコンを`public/icon.png`から、同じ見た目をbase64で`<image>`埋め込みしたSVGコンテナ（`public/icon.svg`）に変換

**結論**: 対策4（新ドメイン移行）と対策5（SVG化）の組み合わせで実機での反映を確認できた。ただし対策5のSVG化には技術的な懸念があったことを明記しておく——Web App ManifestでSVGアイコンを使うことは、AndroidのWebAPK生成システムが一般的にPNG等のラスター画像を前提としているため、本来は逆効果（アイコン不正としてWebAPK生成が失敗する）になるリスクがあった。今回は结果的に問題なく機能したが、これは環境依存の可能性があり、将来的にAndroid/Chromeの挙動が変わった場合は見直しが必要（ユーザーへのリスク説明の上で採用した経緯を記録として残す）。

旧Worker（`ai-link-manager`）は新ドメイン移行後、削除済み。

### 10.3 `/api/metadata`の刷新（OGP → Browser Rendering → Jina Reader）
Jina Readerの制限とSPAレンダリングの課題を踏まえ、Cloudflare Browser Rendering（`@cloudflare/puppeteer`、Workers無料プランで1日10分・同時3ブラウザまで利用可）を本文取得の主経路として追加した。

- **フェーズ1**: 既存のOGP直接fetch（タイトル取得、変更なし）
- **フェーズ2（新規）**: Browser Renderingで実際にページをレンダリングし、`document.body.innerText`から本文を抽出。Jina Readerと違いクリーンなMarkdown変換はしてくれないため、ノイズが多少混ざることを許容（Readabilityアルゴリズムの実装は見送り）。ローカル`next dev`では`env.MYBROWSER`が存在しないため自動的にスキップされる。
- **フェーズ3**: フェーズ2が失敗/`looksLikeRenderFailure()`でゴミ判定された場合のみ、既存のJina Readerに順次フォールバック（ユーザー判断により、Jina Readerは廃止せず保険として残す方針を採用）。フェーズ1・2は`Promise.all`で並行実行し、通常時はフェーズ3の追加レイテンシが発生しない設計。

Geminiの「未ログイン時にログイン画面のガワしか返らない」既知の問題（5.6章）は、レンダリング手段をBrowser Renderingに変えても解消しない可能性が高い（ページ自体の仕様上の制約のため）。
