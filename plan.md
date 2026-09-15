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
  "createdAt": "ISO8601"
}
```

### 5.3 既知のトレードオフ（許容済み）

- `index`キーは1ユーザー1キーの単一JSONのため、複数端末からの同時書き込みでread-modify-write競合が起こりうる（後勝ちで一部更新が消える可能性）。
- `item`本体と`index`は別々のKV書き込みのため、片方のみ失敗する部分失敗が起こりうる（トランザクション非対応）。
- `folders`キー（5.5章）も同じ「1ユーザー1キーのJSON配列」方式であり、同じ競合リスクを持つ。
- **対応方針**: 個人〜少数人利用の前提でリスクを許容し、自動復旧の仕組みは作らない。不整合が疑われる場合は手動確認・再同期で対応する（将来、整合性チェック用のメンテナンススクリプトを検討してもよい）。

### 5.4 API実装メモ（実装時に判明した注意点）

- `caches`（Cloudflare Cache API、4.2章のgetUser()結果キャッシュに使用）は**実際のWorkersランタイム（本番 / `opennextjs-cloudflare preview`）でのみ存在**し、素の`next dev`には存在しない。`typeof caches !== "undefined"`でフィーチャー検出し、存在しない場合はキャッシュなしでAuth APIを直接呼ぶフォールバックにしている（[src/lib/auth/verify.ts](src/lib/auth/verify.ts)）。
- Next.js App Routerはアンダースコアプレフィックスのフォルダやファイルをルーティングから除外する（`_folder`は404になる）。テスト用ルートを置く際は要注意。

### 5.5 フォルダ機能

リンクをフォルダ分けできるようにする。`parentId`による木構造（親フォルダを持たない場合は`parentId: null`）。フラット運用したい場合は全フォルダの`parentId`を`null`のままにすればよい。

**キー**: `user:{user_id}:folders` — 全フォルダのJSON配列（5.1のindexと同じ「軽量な単一キー」方式）。

```json
{
  "id": "uuid",
  "name": "string",
  "parentId": "uuid | null",
  "createdAt": "ISO8601"
}
```

- アイテムの`folderId`は未所属時`null`。フォルダ作成/移動時に親の存在チェック、および移動先が自分自身の子孫にならないかの循環チェックを行う（[src/lib/kv/folders.ts](src/lib/kv/folders.ts)の`wouldCreateCycle`）。
- **削除ポリシー**: 子フォルダまたは所属アイテムが残っているフォルダは削除不可（409を返す）。サイレントなカスケード削除・孤児化を避けるため。UIでは「中身を先に移動/削除してください」という導線が必要。

### 5.6 実装済みAPIエンドポイント

| エンドポイント | メソッド | 内容 |
|---|---|---|
| `/api/items` | GET | 一覧取得（`?folderId=`でフィルタ、`unfiled`で未所属のみ） |
| `/api/items` | POST | 新規作成 |
| `/api/items/[id]` | GET / PATCH / DELETE | 詳細取得・更新（`folderId`での移動含む）・削除 |
| `/api/export` | GET | 全件JSONエクスポート（5.4章方式(A): エクスポート時に個別キーを全件フェッチ） |
| `/api/folders` | GET / POST | フォルダ一覧・作成 |
| `/api/folders/[id]` | PATCH / DELETE | リネーム・移動・削除（空でない場合は409） |

全エンドポイントは`Authorization: Bearer <access_token>`必須（4.2章のgetUser()検証）。

### 5.4 エクスポート機能

「全データをJSONダウンロード」には`contentText`や`memo`を含む全フィールドが必要。indexにはメタデータしかない前提のため、以下のいずれかで対応する（実装フェーズで確定）。

- (A) エクスポート実行時のみ、indexから全item_idを取得し、各itemキーを個別フェッチして組み立てる
- (B) indexに全フィールドを内包する形に変更する（一覧表示用データが重くなるトレードオフに注意）

## 6. PWA / 共有機能

### 6.1 Android

`manifest.json`の`share_target`でWeb Share Targetに対応し、共有シートから`/share`ルートでURLを受け取る。

### 6.2 iOS

iOS SafariはWeb Share Target非対応。**自動クリップボード検知は行わない**（`navigator.clipboard.readText()`のユーザージェスチャー制約・許可ダイアログの問題を避けるため）。代わりに、明示的な「ペースト」ボタンをUI上に用意し、ボタン押下時にクリップボードから読み取る。

### 6.3 タグ

デフォルトタグ: 「知識」「相談」「計画」。ユーザーによるカスタム追加・編集に対応。

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

## 8. Cloudflare Pagesダッシュボード設定手順

- GitHubリポジトリ連携（Pagesプロジェクト作成時に対象リポジトリを選択、`master`ブランチを本番として指定）
- ビルドコマンド・出力ディレクトリを`@cloudflare/next-on-pages`の要求に合わせて設定
- KV Namespaceのバインド（変数名 → 実際のNamespace IDを紐付け）
- 環境変数/Secretsの設定
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - （`getUser()`によるリモート検証方式のため、Supabase JWT secretの保存は不要）

## 9. 今後の検討事項（初期スコープ外）

- LINE / Apple ログイン対応
- KVの不整合が実際に問題化した場合のD1移行検討
- エクスポート方式(A)/(B)の最終選定
