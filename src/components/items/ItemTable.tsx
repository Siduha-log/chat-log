"use client";

import { useEffect, useState } from "react";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import type { IndexEntry } from "@/lib/kv/items";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_TAG_COLOR_ID, getTagColorSwatch, type Tag } from "@/lib/tagColors";
import {
  DEFAULT_AI_TOOL_COLOR_ID,
  getAiToolColorSwatch,
  type AiTool,
} from "@/lib/aiToolColors";
import type { SortOrder } from "@/components/FilterBar";

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <ArrowUpDownIcon className="size-3.5 text-muted-foreground/50" />;
  return direction === "asc" ? (
    <ArrowUpIcon className="size-3.5 text-foreground" />
  ) : (
    <ArrowDownIcon className="size-3.5 text-foreground" />
  );
}

type Props = {
  items: IndexEntry[];
  tags: Tag[];
  aiTools: AiTool[];
  folderNameById: Map<string, string>;
  sort: SortOrder;
  onSortChange: (sort: SortOrder) => void;
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
  tags,
  aiTools,
  folderNameById,
  sort,
  onSortChange,
  draggedItemId,
  onDragStart,
  onDragEnd,
  onMergeIntoNewFolder,
  onToggleFavorite,
  onEdit,
  onDelete,
}: Props) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // タッチ操作主体の端末ではネイティブDnDのdragイベントが発火せず、
  // draggable属性があるだけで長押し時に意味のない選択状態が出てしまうため無効化する
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsCoarsePointer(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const colorForTag = (name: string) =>
    getTagColorSwatch(tags.find((t) => t.name === name)?.color ?? DEFAULT_TAG_COLOR_ID);
  const colorForAiTool = (name: string) =>
    getAiToolColorSwatch(
      aiTools.find((t) => t.name === name)?.color ?? DEFAULT_AI_TOOL_COLOR_ID,
    );

  const toggleTitleSort = () => onSortChange(sort === "title-asc" ? "title-desc" : "title-asc");
  const toggleDateSort = () => onSortChange(sort === "newest" ? "oldest" : "newest");

  return (
    <div className="overflow-hidden rounded-xl border">
      {/* 並び替え（sm未満のみ表示。sm以上はヘッダー行の列見出しから直接切り替える） */}
      <div className="flex items-center justify-end gap-1.5 border-b bg-muted px-3 py-2 text-xs text-muted-foreground sm:hidden">
        <ArrowUpDownIcon className="size-3.5" />
        <select
          aria-label="並び替え"
          className="rounded-md border bg-background px-2 py-1 text-xs"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortOrder)}
        >
          <option value="newest">新着順</option>
          <option value="oldest">古い順</option>
          <option value="title-asc">タイトル順（昇順）</option>
          <option value="title-desc">タイトル順（降順）</option>
        </select>
      </div>

      {/* ヘッダー行（sm以上のみ表示） */}
      <div className="hidden border-b bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[2rem_minmax(0,2.2fr)_minmax(0,1.6fr)_7rem_auto] sm:items-center sm:gap-3">
        <span />
        <button
          type="button"
          onClick={toggleTitleSort}
          className="flex items-center gap-1 text-left transition-colors hover:text-foreground"
        >
          タイトル / メモ
          <SortIcon
            active={sort === "title-asc" || sort === "title-desc"}
            direction={sort === "title-desc" ? "desc" : "asc"}
          />
        </button>
        <span>AIツール / フォルダ名 / タグ</span>
        <button
          type="button"
          onClick={toggleDateSort}
          className="flex items-center gap-1 text-left transition-colors hover:text-foreground"
        >
          日付
          <SortIcon
            active={sort === "newest" || sort === "oldest"}
            direction={sort === "oldest" ? "asc" : "desc"}
          />
        </button>
        <span className="text-right">操作</span>
      </div>

      <div className="divide-y">
        {items.map((item) => {
          const isDraggedOver = dragOverId === item.id && draggedItemId !== item.id;
          const isBeingDragged = draggedItemId === item.id;

          const badgeGroups: React.ReactNode[][] = [
            item.aiTool
              ? [
                  <Badge
                    key="aitool"
                    variant="outline"
                    style={{
                      backgroundColor: colorForAiTool(item.aiTool).bg,
                      color: colorForAiTool(item.aiTool).text,
                      borderColor: "transparent",
                    }}
                  >
                    {item.aiTool}
                  </Badge>,
                ]
              : [],
            item.folderId && folderNameById.get(item.folderId)
              ? [
                  <Badge key="folder" variant="outline">
                    📁 {folderNameById.get(item.folderId)}
                  </Badge>,
                ]
              : [],
            item.tags.map((tag) => {
              const swatch = colorForTag(tag);
              return (
                <Badge
                  key={tag}
                  variant="outline"
                  style={{
                    backgroundColor: swatch.bg,
                    color: swatch.text,
                    borderColor: "transparent",
                  }}
                >
                  #{tag}
                </Badge>
              );
            }),
          ].filter((group) => group.length > 0);

          return (
            <div
              key={item.id}
              draggable={!isCoarsePointer}
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
              className={`flex flex-col gap-2 px-3 py-3 transition-colors sm:grid sm:grid-cols-[2rem_minmax(0,2.2fr)_minmax(0,1.6fr)_7rem_auto] sm:items-center sm:gap-3 ${
                isCoarsePointer ? "select-none" : "cursor-grab"
              } ${isDraggedOver ? "bg-accent ring-2 ring-inset ring-primary" : ""} ${
                isBeingDragged ? "opacity-40" : ""
              }`}
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
                  className="block truncate text-base font-semibold hover:underline"
                >
                  {item.title || item.shareUrl}
                </a>
                {item.memo && (
                  <p className="truncate text-sm text-muted-foreground">{item.memo}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {badgeGroups.map((nodes, gi) => {
                  const [first, ...rest] = nodes;
                  // 区切りの「/」は直後の最初のバッジと1つの塊として扱い、
                  // 折り返し時に「/」だけが前の行に取り残されないようにする
                  return (
                    <span key={gi} className="contents">
                      <span className="inline-flex items-center gap-1.5">
                        {gi > 0 && <span className="text-muted-foreground">/</span>}
                        {first}
                      </span>
                      {rest}
                    </span>
                  );
                })}
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
                  aria-label="削除"
                  className="text-destructive"
                  onClick={() => onDelete(item.id)}
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
