import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChatHub",
  description: "AI共有リンク一元管理PWAアプリ",
  icons: {
    // iOSのapple-touch-iconはSVG非対応のため、appleはPNGのまま維持する
    // （plan.md 6.4章の既知の限界）。faviconのみSVGに切り替える。
    icon: "/icon.svg?v=svg_override_1",
    apple: "/icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "ChatHub",
  },
};

export const viewport: Viewport = {
  themeColor: "#5c8aae",
};

// 初回描画前にテーマを確定させ、light/darkのちらつき（FOUC）を防ぐ。
// 未設定時はOSのprefers-color-schemeに従わず、常にライトをデフォルトにする。
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "light" || stored === "dark" ? stored : "light";
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

// 初回描画前に文字サイズ設定を確定させ、ちらつきを防ぐ（テーマ初期化と同じ方針）。
// "medium"（デフォルト）はdata属性なしのまま（globals.cssの:rootが中サイズ）。
const fontSizeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("fontSize");
    if (stored === "small" || stored === "large") {
      document.documentElement.setAttribute("data-font-size", stored);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: fontSizeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
