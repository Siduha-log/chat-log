"use client";

import type { IndexEntry } from "@/lib/kv/items";
import { Badge } from "@/components/ui/badge";

type Props = {
  item: IndexEntry;
  folderName: string | null;
  onToggleFavorite: (id: string, next: boolean) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

export function ItemCard({
  item,
  folderName,
  onToggleFavorite,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <a
          href={item.shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-medium hover:underline"
        >
          {item.title || item.shareUrl}
        </a>
        <button
          type="button"
          onClick={() => onToggleFavorite(item.id, !item.favorite)}
          aria-label="お気に入り切り替え"
          className="shrink-0 text-lg leading-none"
        >
          {item.favorite ? "★" : "☆"}
        </button>
      </div>

      {item.memo && (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {item.memo}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {item.aiTool && <Badge variant="secondary">{item.aiTool}</Badge>}
        {folderName && <Badge variant="outline">📁 {folderName}</Badge>}
        {item.tags.map((tag) => (
          <Badge key={tag} variant="outline">
            #{tag}
          </Badge>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{new Date(item.createdAt).toLocaleString("ja-JP")}</span>
        <div className="flex gap-3">
          <button type="button" className="underline" onClick={() => onEdit(item.id)}>
            編集
          </button>
          <button
            type="button"
            className="text-red-600 underline"
            onClick={() => onDelete(item.id)}
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
