import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // スマホ実機からLAN経由でローカルのdev serverを開いて動作確認できるようにするため、
  // localhost以外からの /_next/* リソースアクセス（デフォルトではブロックされる）を許可する。
  allowedDevOrigins: ["192.168.0.16"],
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
