"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVerticalIcon, PencilIcon, XIcon } from "lucide-react";
import type { Folder } from "@/lib/kv/folders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FOLDER_NAME_MAX_LENGTH } from "@/lib/constants";

export type FolderSortMode = "custom" | "name" | "created-desc" | "created-asc";

type Props = {
  folders: Folder[];
  selected: string | null | "all";
  sortMode: FolderSortMode;
  draggedItemId: string | null;
  onSortModeChange: (mode: FolderSortMode) => void;
  onSelect: (id: string | null | "all") => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  onDropItem: (folderId: string | null) => void;
  emptyFolderCount: number;
  onDeleteEmptyFolders: () => void;
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

function validateFolderName(name: string): string | null {
  if (!name.trim()) return "フォルダ名を入力してください";
  if (name.length > FOLDER_NAME_MAX_LENGTH) {
    return `フォルダ名は${FOLDER_NAME_MAX_LENGTH}文字以内で入力してください`;
  }
  return null;
}

export function FolderPanel({
  folders,
  selected,
  sortMode,
  draggedItemId,
  onSortModeChange,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onReorder,
  onDropItem,
  emptyFolderCount,
  onDeleteEmptyFolders,
}: Props) {
  const [newName, setNewName] = useState("");
  const [newNameError, setNewNameError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "unfiled" | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [folderDropTarget, setFolderDropTarget] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const copy = [...folders];
    switch (sortMode) {
      case "name":
        copy.sort((a, b) => a.name.localeCompare(b.name, "ja"));
        break;
      case "created-desc":
        copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "created-asc":
        copy.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      default:
        copy.sort((a, b) => a.order - b.order);
    }
    return copy;
  }, [folders, sortMode]);

  const handleFolderDrop = async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const fromIndex = sorted.findIndex((f) => f.id === draggedId);
    const toIndex = sorted.findIndex((f) => f.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...sorted];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    await onReorder(next.map((f) => f.id));
  };

  // フォルダ並び替えのD&Dはマウス/タッチ双方で動かすため、Pointer Eventsで実装する
  // （HTML5ネイティブDnD = draggable/onDragStart等はモバイルブラウザで発火しないため使えない）。
  useEffect(() => {
    if (!draggedFolderId) return;
    const draggedId = draggedFolderId;

    const targetIdAt = (x: number, y: number) => {
      const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-folder-row-id]");
      return row?.dataset.folderRowId ?? null;
    };

    const handleMove = (e: PointerEvent) => {
      const targetId = targetIdAt(e.clientX, e.clientY);
      setFolderDropTarget(targetId && targetId !== draggedId ? targetId : null);
    };

    const handleUp = (e: PointerEvent) => {
      const targetId = targetIdAt(e.clientX, e.clientY);
      setDraggedFolderId(null);
      setFolderDropTarget(null);
      if (targetId && targetId !== draggedId) {
        handleFolderDrop(draggedId, targetId);
      }
    };

    const handleCancel = () => {
      setDraggedFolderId(null);
      setFolderDropTarget(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggedFolderId]);

  const submitNewFolder = async () => {
    const err = validateFolderName(newName);
    setNewNameError(err);
    if (err) return;
    await onCreate(newName.trim());
    setNewName("");
  };

  const submitRename = async (id: string) => {
    const err = validateFolderName(renameValue);
    setRenameError(err);
    if (err) return;
    await onRename(id, renameValue.trim());
    setRenamingId(null);
  };

  const dropHandlers = (key: string | "unfiled", folderId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (draggedItemId) {
        e.preventDefault();
        setDropTarget(key);
      }
    },
    onDragLeave: () => setDropTarget((cur) => (cur === key ? null : cur)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      if (draggedItemId) onDropItem(folderId);
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => onSelect("all")}
        className={`rounded-lg px-2 py-2 text-left text-sm ${
          selected === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
        }`}
      >
        すべて
      </button>
      <button
        type="button"
        onClick={() => onSelect(null)}
        {...dropHandlers("unfiled", null)}
        className={`rounded-lg px-2 py-2 text-left text-sm transition-colors ${
          selected === null ? "bg-primary text-primary-foreground" : "hover:bg-muted"
        } ${dropTarget === "unfiled" ? "ring-2 ring-primary" : ""}`}
      >
        未分類
      </button>

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          フォルダ
        </span>
        <select
          className="rounded-md border bg-background px-2 py-1 text-xs"
          value={sortMode}
          onChange={(e) => onSortModeChange(e.target.value as FolderSortMode)}
        >
          <option value="custom">任意の順序</option>
          <option value="name">名前順</option>
          <option value="created-desc">作成日（新しい順）</option>
          <option value="created-asc">作成日（古い順）</option>
        </select>
      </div>

      {sorted.map((folder) => (
        <div key={folder.id} className="flex flex-col gap-1" data-folder-row-id={folder.id}>
          <div
            className={`flex items-center gap-1 rounded-lg transition-colors ${
              folderDropTarget === folder.id ? "ring-2 ring-primary" : ""
            } ${draggedFolderId === folder.id ? "opacity-40" : ""}`}
          >
            {renamingId === folder.id ? (
              <>
                <Input
                  autoFocus
                  value={renameValue}
                  maxLength={FOLDER_NAME_MAX_LENGTH}
                  onChange={(e) => {
                    // maxLength属性はIME（日本語入力）の変換中は効かないことがあるため、
                    // 確定値も明示的にクリップする。
                    setRenameValue(e.target.value.slice(0, FOLDER_NAME_MAX_LENGTH));
                    setRenameError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitRename(folder.id);
                    }
                  }}
                  className="h-8 text-sm"
                  style={{ marginLeft: depthOf(folders, folder) * 12 }}
                />
                <Button size="sm" variant="ghost" onClick={() => submitRename(folder.id)}>
                  OK
                </Button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onSelect(folder.id)}
                  {...dropHandlers(folder.id, folder.id)}
                  style={{ marginLeft: depthOf(folders, folder) * 12 }}
                  className={`flex-1 truncate rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                    selected === folder.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  } ${dropTarget === folder.id ? "ring-2 ring-primary" : ""}`}
                >
                  📁 {folder.name}
                </button>
                {sortMode === "custom" && (
                  <span
                    role="button"
                    aria-label="ドラッグして並び替え"
                    tabIndex={-1}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setDraggedFolderId(folder.id);
                    }}
                    className="touch-none cursor-grab px-2 py-2 text-muted-foreground active:cursor-grabbing"
                  >
                    <GripVerticalIcon className="size-3.5" />
                  </span>
                )}
                <button
                  type="button"
                  aria-label="改名"
                  className="px-1 py-1 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setRenamingId(folder.id);
                    setRenameValue(folder.name);
                    setRenameError(null);
                  }}
                >
                  <PencilIcon className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="削除"
                  className="px-1 py-1 text-destructive"
                  onClick={() => onDelete(folder.id)}
                >
                  <XIcon className="size-3.5" />
                </button>
              </>
            )}
          </div>
          {renamingId === folder.id && renameError && (
            <p className="text-xs text-destructive">{renameError}</p>
          )}
        </div>
      ))}

      <div className="mt-2 flex flex-col gap-1">
        <div className="flex gap-2">
          <Input
            placeholder="新しいフォルダ名"
            value={newName}
            maxLength={FOLDER_NAME_MAX_LENGTH}
            onChange={(e) => {
              setNewName(e.target.value.slice(0, FOLDER_NAME_MAX_LENGTH));
              setNewNameError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitNewFolder();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={submitNewFolder}>
            追加
          </Button>
        </div>
        {newNameError && <p className="text-xs text-destructive">{newNameError}</p>}
      </div>

      {emptyFolderCount > 0 && (
        <div className="mt-2">
          <button
            type="button"
            className="text-xs text-destructive underline"
            onClick={onDeleteEmptyFolders}
          >
            空のフォルダを一括削除（{emptyFolderCount}件）
          </button>
        </div>
      )}
    </div>
  );
}
