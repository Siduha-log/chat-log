"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  aiTools: string[];
  onCreate: (name: string) => Promise<void>;
  onRename: (oldName: string, newName: string) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
};

export function AiToolPanel({ aiTools, onCreate, onRename, onDelete }: Props) {
  const [newAiTool, setNewAiTool] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {aiTools.map((tool) =>
          renaming === tool ? (
            <div key={tool} className="flex items-center gap-1">
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
                  if (renameValue.trim() && renameValue.trim() !== tool) {
                    await onRename(tool, renameValue.trim());
                  }
                  setRenaming(null);
                }}
              >
                OK
              </Button>
            </div>
          ) : (
            <div key={tool} className="flex items-center gap-1">
              <Badge variant="outline">{tool}</Badge>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => {
                  setRenaming(tool);
                  setRenameValue(tool);
                }}
              >
                改名
              </button>
              <button
                type="button"
                className="text-xs text-destructive underline"
                onClick={() => onDelete(tool)}
              >
                削除
              </button>
            </div>
          ),
        )}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="新しいAIツール"
          value={newAiTool}
          onChange={(e) => setNewAiTool(e.target.value)}
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
