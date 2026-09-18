"use client";

import { useState } from "react";
import { PaletteIcon, PencilIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TAG_COLOR_PALETTE, getTagColorSwatch, type Tag } from "@/lib/tagColors";

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
  const [pickingColorFor, setPickingColorFor] = useState<string | null>(null);

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
                onChange={(e) => setRenameValue(e.target.value)}
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
            <div key={tag.name} className="group flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedTag((cur) => {
                      const next = cur === tag.name ? null : tag.name;
                      if (next !== tag.name) setPickingColorFor(null);
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
                    className={expandedTag === tag.name ? "ring-2 ring-primary" : ""}
                  >
                    #{tag.name}
                  </Badge>
                </button>
                <div
                  className={`items-center gap-1 group-hover:flex ${
                    expandedTag === tag.name ? "flex" : "hidden"
                  }`}
                >
                  <button
                    type="button"
                    aria-label="色を変更"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setPickingColorFor((cur) => (cur === tag.name ? null : tag.name))
                    }
                  >
                    <PaletteIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="改名"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setRenaming(tag.name);
                      setRenameValue(tag.name);
                    }}
                  >
                    <PencilIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="削除"
                    className="text-destructive"
                    onClick={() => onDelete(tag.name)}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              </div>
              {pickingColorFor === tag.name && (
                <div className="flex flex-wrap gap-1 rounded-md border bg-muted/40 p-1.5">
                  {TAG_COLOR_PALETTE.map((swatch) => (
                    <button
                      key={swatch.id}
                      type="button"
                      aria-label={swatch.label}
                      title={swatch.label}
                      onClick={async () => {
                        await onChangeColor(tag.name, swatch.id);
                        setPickingColorFor(null);
                      }}
                      className={`size-5 rounded-full border transition-transform ${
                        tag.color === swatch.id
                          ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                          : "border-border"
                      }`}
                      style={{ backgroundColor: swatch.bg }}
                    />
                  ))}
                </div>
              )}
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
