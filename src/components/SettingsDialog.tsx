"use client";

import { useEffect, useState } from "react";
import { FingerprintIcon, XIcon } from "lucide-react";
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

// Supabaseのパスキー機能はまだexperimental扱いで、パッケージのトップレベル
// エクスポートに型が含まれていないため、必要な形だけをここで定義する。
type PasskeyListItem = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

export function SettingsDialog({ open, onOpenChange }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [passkeys, setPasskeys] = useState<PasskeyListItem[] | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setPasskeyError(null);
      const supabase = createClient();
      const { data, error } = await supabase.auth.passkey.list();
      if (error) {
        setPasskeyError(error.message || "パスキー一覧の取得に失敗しました。");
        return;
      }
      setPasskeys(data ?? []);
    })();
  }, [open]);

  const handleRegisterPasskey = async () => {
    setPasskeyBusy(true);
    setPasskeyError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.registerPasskey();
    setPasskeyBusy(false);

    if (error) {
      setPasskeyError(error.message || "パスキーの登録に失敗しました。");
      return;
    }
    if (data) {
      setPasskeys((cur) => [...(cur ?? []), data]);
    }
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    if (!window.confirm("このパスキーを削除しますか？")) return;
    setPasskeyBusy(true);
    setPasskeyError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.passkey.delete({ passkeyId });
    setPasskeyBusy(false);

    if (error) {
      setPasskeyError(error.message || "パスキーの削除に失敗しました。");
      return;
    }
    setPasskeys((cur) => (cur ?? []).filter((p) => p.id !== passkeyId));
  };

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
          <p className="text-sm font-medium">パスキー</p>
          {passkeys === null ? (
            <p className="text-xs text-muted-foreground">読み込み中...</p>
          ) : passkeys.length === 0 ? (
            <p className="text-xs text-muted-foreground">登録済みのパスキーはありません。</p>
          ) : (
            <div className="flex flex-col gap-1">
              {passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FingerprintIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{pk.friendly_name || "パスキー"}</span>
                  </span>
                  <button
                    type="button"
                    aria-label="削除"
                    className="shrink-0 text-destructive disabled:opacity-50"
                    disabled={passkeyBusy}
                    onClick={() => handleDeletePasskey(pk.id)}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={passkeyBusy}
            onClick={handleRegisterPasskey}
          >
            <FingerprintIcon className="size-4" />
            {passkeyBusy ? "処理中..." : "このデバイスにパスキーを登録"}
          </Button>
          {passkeyError && <p className="text-xs text-destructive">{passkeyError}</p>}
        </div>

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
