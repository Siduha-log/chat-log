"use client";

import { useState } from "react";
import { PaletteIcon, PencilIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TAG_COLOR_PALETTE, getTagColorSwatch, type Tag } from "@/lib/tagColors";
import { TAG_NAME_MAX_LENGTH } from "@/lib/constants";

type Props = {
  tags: Tag[];
  onCreate: (name: string) => Promise<void>;
  onRename: (oldName: string, newName: string) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onChangeColor: (name: string, color: string) => Promise<void>;
};

export function TagPanel({ tags, onCreate, onRename, onDelete, onChangeColor }: Props) {
  const [newTag, setNewTag] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [pickingColorFor, setPickingColorFor] = useState(false);

  // クリックで固定表示中のタグを優先し、なければホバー中のタグをプレビュー表示する
  const activeTagName = expandedTag ?? hoveredTag;
  const activeTag = tags.find((t) => t.name === activeTagName) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) =>
          renaming === tag.name ? (
            <div key={tag.name} className="flex items-center gap-1">
              <Input
                autoFocus
                className="h-7 w-28 text-sm"
                value={renameValue}
                maxLength={TAG_NAME_MAX_LENGTH}
                onChange={(e) => setRenameValue(e.target.value.slice(0, TAG_NAME_MAX_LENGTH))}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (renameValue.trim() && renameValue.trim() !== tag.name) {
                    await onRename(tag.name, renameValue.trim());
                  }
                  setRenaming(null);
                }}
              >
                OK
              </Button>
            </div>
          ) : (
            <button
              key={tag.name}
              type="button"
              onMouseEnter={() => setHoveredTag(tag.name)}
              onMouseLeave={() => setHoveredTag((cur) => (cur === tag.name ? null : cur))}
              onClick={() =>
                setExpandedTag((cur) => {
                  const next = cur === tag.name ? null : tag.name;
                  if (next !== tag.name) setPickingColorFor(false);
                  return next;
                })
              }
            >
              <Badge
                variant="outline"
                style={{
                  backgroundColor: getTagColorSwatch(tag.color).bg,
                  color: getTagColorSwatch(tag.color).text,
                  borderColor: "transparent",
                }}
                className={activeTagName === tag.name ? "ring-2 ring-primary" : ""}
              >
                #{tag.name}
              </Badge>
            </button>
          ),
        )}
      </div>

      {/* タグ一覧の折り返しレイアウトに操作アイコンを混ぜるとホバー時にちらつくため、
          選択中のタグの操作は一覧とは別のこの専用エリアにまとめて表示する */}
      {activeTag && (
        <div className="flex flex-col gap-1.5 rounded-md border bg-muted/40 p-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              style={{
                backgroundColor: getTagColorSwatch(activeTag.color).bg,
                color: getTagColorSwatch(activeTag.color).text,
                borderColor: "transparent",
              }}
            >
              #{activeTag.name}
            </Badge>
            <button
              type="button"
              aria-label="色を変更"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setPickingColorFor((v) => !v)}
            >
              <PaletteIcon className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="改名"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                setRenaming(activeTag.name);
                setRenameValue(activeTag.name);
              }}
            >
              <PencilIcon className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="削除"
              className="text-destructive"
              onClick={() => onDelete(activeTag.name)}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
          {pickingColorFor && (
            <div className="flex flex-wrap gap-1">
              {TAG_COLOR_PALETTE.map((swatch) => (
                <button
                  key={swatch.id}
                  type="button"
                  aria-label={swatch.label}
                  title={swatch.label}
                  onClick={async () => {
                    await onChangeColor(activeTag.name, swatch.id);
                    setPickingColorFor(false);
                  }}
                  className={`size-5 rounded-full border transition-transform ${
                    activeTag.color === swatch.id
                      ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                      : "border-border"
                  }`}
                  style={{ backgroundColor: swatch.bg }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="新しいタグ"
          value={newTag}
          maxLength={TAG_NAME_MAX_LENGTH}
          onChange={(e) => setNewTag(e.target.value.slice(0, TAG_NAME_MAX_LENGTH))}
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
