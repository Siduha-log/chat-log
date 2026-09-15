"use client";

import { useMemo, useState } from "react";
import type { Folder } from "@/lib/kv/folders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  folders: Folder[];
  selected: string | null | "all";
  sortMode: "custom" | "name";
  onSortModeChange: (mode: "custom" | "name") => void;
  onSelect: (id: string | null | "all") => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
};

function depthOf(folders: Folder[], folder: Folder): number {
  let depth = 0;
  let current: Folder | undefined = folder;
  while (current?.parentId) {
    current = folders.find((f) => f.id === current!.parentId);
    depth += 1;
    if (depth > 20) break; // 保険（循環は作成/移動時に防止済み）
  }
  return depth;
}

export function FolderPanel({
  folders,
  selected,
  sortMode,
  onSortModeChange,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onReorder,
}: Props) {
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const sorted = useMemo(() => {
    const copy = [...folders];
    if (sortMode === "name") {
      copy.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    } else {
      copy.sort((a, b) => a.order - b.order);
    }
    return copy;
  }, [folders, sortMode]);

  const move = async (index: number, direction: "up" | "down") => {
    if (sortMode !== "custom") return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= sorted.length) return;
    const next = [...sorted];
    [next[index], next[target]] = [next[target], next[index]];
    await onReorder(next.map((f) => f.id));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">フォルダ</span>
        <select
          className="rounded-md border bg-background px-2 py-1 text-xs"
          value={sortMode}
          onChange={(e) => onSortModeChange(e.target.value as "custom" | "name")}
        >
          <option value="custom">任意の順序</option>
          <option value="name">名前順</option>
        </select>
      </div>

      <button
        type="button"
        onClick={() => onSelect("all")}
        className={`rounded px-2 py-1 text-left text-sm ${
          selected === "all" ? "bg-foreground text-background" : "hover:bg-muted"
        }`}
      >
        すべて
      </button>
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`rounded px-2 py-1 text-left text-sm ${
          selected === null ? "bg-foreground text-background" : "hover:bg-muted"
        }`}
      >
        未分類
      </button>

      {sorted.map((folder, index) => (
        <div key={folder.id} className="flex items-center gap-1">
          {renamingId === folder.id ? (
            <>
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="h-7 text-sm"
                style={{ marginLeft: depthOf(folders, folder) * 12 }}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (renameValue.trim()) await onRename(folder.id, renameValue.trim());
                  setRenamingId(null);
                }}
              >
                OK
              </Button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onSelect(folder.id)}
                style={{ marginLeft: depthOf(folders, folder) * 12 }}
                className={`flex-1 truncate rounded px-2 py-1 text-left text-sm ${
                  selected === folder.id ? "bg-foreground text-background" : "hover:bg-muted"
                }`}
              >
                {folder.name}
              </button>
              {sortMode === "custom" && (
                <>
                  <button
                    type="button"
                    aria-label="上へ"
                    className="px-1 text-xs disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => move(index, "up")}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label="下へ"
                    className="px-1 text-xs disabled:opacity-30"
                    disabled={index === sorted.length - 1}
                    onClick={() => move(index, "down")}
                  >
                    ▼
                  </button>
                </>
              )}
              <button
                type="button"
                className="px-1 text-xs underline"
                onClick={() => {
                  setRenamingId(folder.id);
                  setRenameValue(folder.name);
                }}
              >
                改名
              </button>
              <button
                type="button"
                className="px-1 text-xs text-red-600 underline"
                onClick={() => onDelete(folder.id)}
              >
                削除
              </button>
            </>
          )}
        </div>
      ))}

      <div className="mt-2 flex gap-2">
        <Input
          placeholder="新しいフォルダ名"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && newName.trim()) {
              e.preventDefault();
              await onCreate(newName.trim());
              setNewName("");
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            if (newName.trim()) {
              await onCreate(newName.trim());
              setNewName("");
            }
          }}
        >
          追加
        </Button>
      </div>
    </div>
  );
}
