"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type FontSize = "small" | "medium" | "large";

const OPTIONS: { value: FontSize; label: string }[] = [
  { value: "small", label: "小" },
  { value: "medium", label: "中" },
  { value: "large", label: "大" },
];

function applyFontSize(size: FontSize) {
  if (size === "medium") {
    document.documentElement.removeAttribute("data-font-size");
  } else {
    document.documentElement.setAttribute("data-font-size", size);
  }
  localStorage.setItem("fontSize", size);
}

export function FontSizeSetting() {
  const [fontSize, setFontSize] = useState<FontSize | null>(null);

  useEffect(() => {
    // ThemeToggleと同様、SSR/クライアントのハイドレーション不一致を避けるため
    // マウント後にDOM（layout.tsxのインラインスクリプトが既に設定済み）から読む。
    // data属性なし＝デフォルトの"medium"（globals.cssの:rootが中サイズ）。
    const current = document.documentElement.getAttribute("data-font-size");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFontSize(current === "small" || current === "large" ? current : "medium");
  }, []);

  if (fontSize === null) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        文字サイズ
      </p>
      <div className="flex gap-2">
        {OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            type="button"
            variant={fontSize === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => {
              applyFontSize(opt.value);
              setFontSize(opt.value);
            }}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
