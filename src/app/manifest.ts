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
    // アイコン画像を差し替えた際は、実機のPWAインストールキャッシュ（Chrome/Androidが
    // OSショートカット用に保存したアイコン）を確実に更新させるため、?v=のクエリ値を変えること。
    // any用（192/512）とmaskable用（512、Androidのアダプティブアイコンでクロップされても
    // 絵柄が切れないよう安全領域に縮小配置した専用画像）を分けて用意している。
    icons: [
      { src: "/icon-192.png?v=png_v1", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png?v=png_v1", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512-maskable.png?v=png_v1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  } as MetadataRoute.Manifest;
}
