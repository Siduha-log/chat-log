"use client";

import { useState } from "react";
import { PaletteIcon, PencilIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AI_TOOL_COLOR_PALETTE, getAiToolColorSwatch, type AiTool } from "@/lib/aiToolColors";
import { AI_TOOL_NAME_MAX_LENGTH } from "@/lib/constants";

type Props = {
  aiTools: AiTool[];
  onCreate: (name: string) => Promise<void>;
  onRename: (oldName: string, newName: string) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onChangeColor: (name: string, color: string) => Promise<void>;
};

export function AiToolPanel({ aiTools, onCreate, onRename, onDelete, onChangeColor }: Props) {
  const [newAiTool, setNewAiTool] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const [pickingColorFor, setPickingColorFor] = useState(false);

  // クリックで固定表示中のツールを優先し、なければホバー中のツールをプレビュー表示する
  const activeToolName = expandedTool ?? hoveredTool;
  const activeTool = aiTools.find((t) => t.name === activeToolName) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {aiTools.map((tool) =>
          renaming === tool.name ? (
            <div key={tool.name} className="flex items-center gap-1">
              <Input
                autoFocus
                className="h-7 w-28 text-sm"
                value={renameValue}
                maxLength={AI_TOOL_NAME_MAX_LENGTH}
                onChange={(e) => setRenameValue(e.target.value.slice(0, AI_TOOL_NAME_MAX_LENGTH))}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (renameValue.trim() && renameValue.trim() !== tool.name) {
                    await onRename(tool.name, renameValue.trim());
                  }
                  setRenaming(null);
                }}
              >
                OK
              </Button>
            </div>
          ) : (
            <button
              key={tool.name}
              type="button"
              onMouseEnter={() => setHoveredTool(tool.name)}
              onMouseLeave={() => setHoveredTool((cur) => (cur === tool.name ? null : cur))}
              onClick={() =>
                setExpandedTool((cur) => {
                  const next = cur === tool.name ? null : tool.name;
                  if (next !== tool.name) setPickingColorFor(false);
                  return next;
                })
              }
            >
              <Badge
                variant="outline"
                style={{
                  backgroundColor: getAiToolColorSwatch(tool.color).bg,
                  color: getAiToolColorSwatch(tool.color).text,
                  borderColor: "transparent",
                }}
                className={activeToolName === tool.name ? "ring-2 ring-primary" : ""}
              >
                {tool.name}
              </Badge>
            </button>
          ),
        )}
      </div>

      {/* AIツール一覧の折り返しレイアウトに操作アイコンを混ぜるとホバー時にちらつくため、
          選択中のツールの操作は一覧とは別のこの専用エリアにまとめて表示する */}
      {activeTool && (
        <div className="flex flex-col gap-1.5 rounded-md border bg-muted/40 p-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              style={{
                backgroundColor: getAiToolColorSwatch(activeTool.color).bg,
                color: getAiToolColorSwatch(activeTool.color).text,
                borderColor: "transparent",
              }}
            >
              {activeTool.name}
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
                setRenaming(activeTool.name);
                setRenameValue(activeTool.name);
              }}
            >
              <PencilIcon className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="削除"
              className="text-destructive"
              onClick={() => onDelete(activeTool.name)}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
          {pickingColorFor && (
            <div className="flex flex-wrap gap-1">
              {AI_TOOL_COLOR_PALETTE.map((swatch) => (
                <button
                  key={swatch.id}
                  type="button"
                  aria-label={swatch.label}
                  title={swatch.label}
                  onClick={async () => {
                    await onChangeColor(activeTool.name, swatch.id);
                    setPickingColorFor(false);
                  }}
                  className={`size-5 rounded-full border transition-transform ${
                    activeTool.color === swatch.id
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
          placeholder="新しいAIツール"
          value={newAiTool}
          maxLength={AI_TOOL_NAME_MAX_LENGTH}
          onChange={(e) => setNewAiTool(e.target.value.slice(0, AI_TOOL_NAME_MAX_LENGTH))}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && newAiTool.trim()) {
              e.preventDefault();
              await onCreate(newAiTool.trim());
              setNewAiTool("");
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            if (newAiTool.trim()) {
              await onCreate(newAiTool.trim());
              setNewAiTool("");
            }
          }}
        >
          追加
        </Button>
      </div>
    </div>
  );
}
