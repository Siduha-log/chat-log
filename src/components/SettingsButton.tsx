"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { SettingsDialog } from "@/components/SettingsDialog";

export function SettingsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="設定"
        className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm hover:bg-muted"
      >
        <Settings className="h-4 w-4" />
        設定
      </button>
      <SettingsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
