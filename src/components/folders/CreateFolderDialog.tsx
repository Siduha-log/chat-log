"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FOLDER_NAME_MAX_LENGTH } from "@/lib/constants";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => Promise<void>;
};

// テーブルの行を別の行の上にドラッグ&ドロップしたときに開く、
// 「新しいフォルダを名前を付けて作成し、両方まとめる」ダイアログ。
export function CreateFolderDialog({ open, onOpenChange, onConfirm }: Props) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!name.trim()) return;
    if (name.length > FOLDER_NAME_MAX_LENGTH) {
      setError(`フォルダ名は${FOLDER_NAME_MAX_LENGTH}文字以内で入力してください`);
      return;
    }
    setSaving(true);
    try {
      await onConfirm(name.trim());
      setName("");
      setError(null);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setName("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新しいフォルダを作成しますか？</DialogTitle>
          <DialogDescription>
            名前を付けて新しいフォルダを作成し、この2つのリンクをまとめて移動します。
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="フォルダ名"
          value={name}
          maxLength={FOLDER_NAME_MAX_LENGTH}
          onChange={(e) => {
            setName(e.target.value.slice(0, FOLDER_NAME_MAX_LENGTH));
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleConfirm();
            }
          }}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleConfirm} disabled={saving || !name.trim()}>
            {saving ? "作成中..." : "作成してまとめる"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
