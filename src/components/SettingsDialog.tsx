"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FontSizeSetting } from "@/components/FontSizeSetting";
import { createClient } from "@/lib/supabase/client";
import { apiSend } from "@/lib/api/client";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    if (
      !window.confirm(
        "本当にアカウントを削除しますか？（削除するとすべてのデータが消去されます）",
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await apiSend("/api/account", "DELETE");
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>設定</DialogTitle>
        </DialogHeader>
        <FontSizeSetting />

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-destructive">危険な操作</p>
          <Button variant="destructive" disabled={deleting} onClick={handleDeleteAccount}>
            {deleting ? "削除中..." : "アカウント削除"}
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
