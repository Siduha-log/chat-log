"use client";

import { useState } from "react";
import type { IndexEntry } from "@/lib/kv/items";
import { Badge } from "@/components/ui/badge";

type Props = {
  items: IndexEntry[];
  folderNameById: Map<string, string>;
  draggedItemId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMergeIntoNewFolder: (draggedId: string, targetId: string) => void;
  onToggleFavorite: (id: string, next: boolean) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

export function ItemTable({
  items,
  folderNameById,
  draggedItemId,
  onDragStart,
  onDragEnd,
  onMergeIntoNewFolder,
  onToggleFavorite,
  onEdit,
  onDelete,
}: Props) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border">
      {/* ヘッダー行（sm以上のみ表示） */}
      <div className="hidden border-b bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[2rem_minmax(0,2.2fr)_minmax(0,1.6fr)_7rem_auto] sm:items-center sm:gap-3">
        <span />
        <span>タイトル / メモ</span>
        <span>AIツール・フォルダ・タグ</span>
        <span>日付</span>
        <span className="text-right">操作</span>
      </div>

      <div className="divide-y">
        {items.map((item) => {
          const isDraggedOver = dragOverId === item.id && draggedItemId !== item.id;
          const isBeingDragged = draggedItemId === item.id;

          return (
            <div
              key={item.id}
              draggable
              onDragStart={() => onDragStart(item.id)}
              onDragEnd={() => {
                onDragEnd();
                setDragOverId(null);
              }}
              onDragOver={(e) => {
                if (draggedItemId && draggedItemId !== item.id) {
                  e.preventDefault();
                  setDragOverId(item.id);
                }
              }}
              onDragLeave={() => setDragOverId((cur) => (cur === item.id ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverId(null);
                if (draggedItemId && draggedItemId !== item.id) {
                  onMergeIntoNewFolder(draggedItemId, item.id);
                }
              }}
              className={`flex cursor-grab flex-col gap-2 px-3 py-3 transition-colors sm:grid sm:grid-cols-[2rem_minmax(0,2.2fr)_minmax(0,1.6fr)_7rem_auto] sm:items-center sm:gap-3 ${
                isDraggedOver ? "bg-accent ring-2 ring-inset ring-primary" : ""
              } ${isBeingDragged ? "opacity-40" : ""}`}
            >
              <button
                type="button"
                onClick={() => onToggleFavorite(item.id, !item.favorite)}
                aria-label="お気に入り切り替え"
                className="w-6 shrink-0 text-lg leading-none text-favorite"
              >
                {item.favorite ? "★" : "☆"}
              </button>

              <div className="min-w-0">
                <a
                  href={item.shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-medium hover:underline"
                >
                  {item.title || item.shareUrl}
                </a>
                {item.memo && (
                  <p className="truncate text-sm text-muted-foreground">{item.memo}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {item.aiTool && <Badge variant="secondary">{item.aiTool}</Badge>}
                {item.folderId && folderNameById.get(item.folderId) && (
                  <Badge variant="outline">📁 {folderNameById.get(item.folderId)}</Badge>
                )}
                {item.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    #{tag}
                  </Badge>
                ))}
              </div>

              <span className="text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleDateString("ja-JP")}
              </span>

              <div className="flex justify-end gap-3 text-xs">
                <button type="button" className="underline" onClick={() => onEdit(item.id)}>
                  編集
                </button>
                <button
                  type="button"
                  className="text-destructive underline"
                  onClick={() => onDelete(item.id)}
                >
                  削除
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
