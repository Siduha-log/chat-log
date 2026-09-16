import type { MetadataRoute } from "next";

// Androidの共有シートからURLを受け取れるようにshare_targetを設定する
// （/shareルートで受信、src/app/share/route.ts参照）。share_targetは
// MetadataRoute.Manifestの型定義に含まれないため、返却時にアサーションする。
//
// 新ドメイン（chathub-app、wrangler.jsonc参照）への移行に伴い、旧ドメイン
// （ai-link-manager）でのWebAPK固着回避のための一時的なバージョン標
// （name末尾ドット、id/start_urlのクエリ）は不要になったため本来の値に戻している。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChatHub",
    short_name: "ChatHub",
    description: "AI共有リンク一元管理PWAアプリ",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf8",
    theme_color: "#5c8aae",
    // ?v=svg_override_1はキャッシュ破棄用のクエリ。アイコン画像を差し替えた際は、実機の
    // PWAインストールキャッシュ（Chrome/AndroidがOSショートカット用に保存した
    // アイコン）を確実に更新させるため、この値を変えること。
    // icon.svgは元のicon.png（見た目はそのまま）をbase64で<image>埋め込みしたSVG
    // コンテナ（public/icon.svg生成時のコメント参照）。AndroidのWebAPK生成が
    // 一般的にSVGアイコンを想定していない点は既知のリスクとして許容している。
    icons: [{ src: "/icon.svg?v=svg_override_1", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  } as MetadataRoute.Manifest;
}
