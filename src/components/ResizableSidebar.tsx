"use client";

import { useRef, useState, type ReactNode } from "react";

const STORAGE_KEY = "sidebarWidth";
const DEFAULT_WIDTH = 320; // 20rem
const MIN_WIDTH = 200;
const MAX_WIDTH = 640;

// スマホ画面（Sheet経由での表示）でサイドバーが画面外にはみ出さないよう、
// 実際のビューポート幅の90%も上限に含める。
function clamp(width: number): number {
  const viewportCap =
    typeof window !== "undefined" ? window.innerWidth * 0.9 : MAX_WIDTH;
  const effectiveMax = Math.min(MAX_WIDTH, viewportCap);
  return Math.min(effectiveMax, Math.max(MIN_WIDTH, width));
}

function readStoredWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    const initial = stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH;
    return clamp(initial);
  } catch {
    return clamp(DEFAULT_WIDTH);
  }
}

function saveWidth(width: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // プライベートブラウジング等でlocalStorageが使えなくても、幅の変更自体は動作させる
  }
}

type Props = {
  children: ReactNode;
};

// PCブラウザ向けサイドバーの可変幅コンポーネント。デフォルト20rem、
// 右端をドラッグして200〜640pxの範囲で変更でき、localStorageに幅を記憶する。
export function ResizableSidebar({ children }: Props) {
  const [width, setWidth] = useState(readStoredWidth);
  const draggingRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const handleMove = (moveEvent: PointerEvent) => {
      if (!draggingRef.current) return;
      setWidth(clamp(startWidth + (moveEvent.clientX - startX)));
    };

    const handleUp = (upEvent: PointerEvent) => {
      draggingRef.current = false;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      saveWidth(clamp(startWidth + (upEvent.clientX - startX)));
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const resetWidth = () => {
    setWidth(DEFAULT_WIDTH);
    saveWidth(DEFAULT_WIDTH);
  };

  return (
    <div className="relative h-full shrink-0" style={{ width }}>
      <div className="h-full overflow-y-auto pr-3">{children}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="サイドバー幅を変更（ダブルクリックでリセット）"
        onPointerDown={handlePointerDown}
        onDoubleClick={resetWidth}
        className="absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border hover:after:bg-primary"
      />
    </div>
  );
}
