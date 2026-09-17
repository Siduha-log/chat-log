"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  tags: string[];
  onCreate: (name: string) => Promise<void>;
  onRename: (oldName: string, newName: string) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
};

export function TagPanel({ tags, onCreate, onRename, onDelete }: Props) {
  const [newTag, setNewTag] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) =>
          renaming === tag ? (
            <div key={tag} className="flex items-center gap-1">
              <Input
                autoFocus
                className="h-7 w-28 text-sm"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (renameValue.trim() && renameValue.trim() !== tag) {
                    await onRename(tag, renameValue.trim());
                  }
                  setRenaming(null);
                }}
              >
                OK
              </Button>
            </div>
          ) : (
            <div key={tag} className="flex items-center gap-1">
              <Badge variant="outline">#{tag}</Badge>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => {
                  setRenaming(tag);
                  setRenameValue(tag);
                }}
              >
                改名
              </button>
              <button
                type="button"
                className="text-xs text-destructive underline"
                onClick={() => onDelete(tag)}
              >
                削除
              </button>
            </div>
          ),
        )}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="新しいタグ"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && newTag.trim()) {
              e.preventDefault();
              await onCreate(newTag.trim());
              setNewTag("");
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            if (newTag.trim()) {
              await onCreate(newTag.trim());
              setNewTag("");
            }
          }}
        >
          追加
        </Button>
      </div>
    </div>
  );
}
