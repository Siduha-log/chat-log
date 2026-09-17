"use client";

import { useState } from "react";
import { PencilIcon, XIcon } from "lucide-react";
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
                aria-label="改名"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setRenaming(tag);
                  setRenameValue(tag);
                }}
              >
                <PencilIcon className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="削除"
                className="text-destructive"
                onClick={() => onDelete(tag)}
              >
                <XIcon className="size-3.5" />
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
