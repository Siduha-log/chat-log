"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // SSR/クライアントのハイドレーション不一致を避けるため、初期値はnullのまま
    // サーバーと最初のクライアントレンダーを一致させ、マウント後にDOM
    // （layout.tsxのインラインスクリプトが既に設定済み）から実際の値を読む。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  if (theme === null) return null;

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="ライト/ダークモード切り替え"
      className="rounded-md border bg-background px-2.5 py-1.5 text-sm hover:bg-muted"
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
