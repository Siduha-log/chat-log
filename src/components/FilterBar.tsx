"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTagColorSwatch, type Tag } from "@/lib/tagColors";

export type SortOrder = "newest" | "oldest" | "title-asc" | "title-desc";

export type Filters = {
  query: string;
  tags: string[]; // 空配列 = すべて（複数選択時はいずれかのタグを含むものがヒット、OR条件）
  aiTool: string | "all";
  favoriteOnly: boolean;
  dateFrom: string; // yyyy-mm-dd or ""
  dateTo: string;
  sort: SortOrder;
};

export const defaultFilters: Filters = {
  query: "",
  tags: [],
  aiTool: "all",
  favoriteOnly: false,
  dateFrom: "",
  dateTo: "",
  sort: "newest",
};

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
  availableTags: Tag[];
  availableAiTools: string[];
};

// 検索キーワード以外の項目が既定値から変わっているかどうか
// （「絞り込み適用中」バッジの表示判定に使う。並び替えは絞り込みではないため含めない）
function hasActiveAdvancedFilters(filters: Filters): boolean {
  return (
    filters.tags.length > 0 ||
    filters.aiTool !== defaultFilters.aiTool ||
    filters.favoriteOnly !== defaultFilters.favoriteOnly ||
    filters.dateFrom !== defaultFilters.dateFrom ||
    filters.dateTo !== defaultFilters.dateTo
  );
}

export function FilterBar({ filters, onChange, availableTags, availableAiTools }: Props) {
  const [expanded, setExpanded] = useState(false);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  const toggleTag = (tag: string) => {
    set(
      "tags",
      filters.tags.includes(tag)
        ? filters.tags.filter((t) => t !== tag)
        : [...filters.tags, tag],
    );
  };

  const clearAdvancedFilters = () => {
    onChange({
      ...filters,
      tags: defaultFilters.tags,
      aiTool: defaultFilters.aiTool,
      favoriteOnly: defaultFilters.favoriteOnly,
      dateFrom: defaultFilters.dateFrom,
      dateTo: defaultFilters.dateTo,
    });
  };

  const advancedActive = hasActiveAdvancedFilters(filters);

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="search">検索</Label>
          <Input
            id="search"
            placeholder="タイトル・メモ・本文で検索"
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          詳細フィルター {expanded ? "▴" : "▾"}
          {advancedActive && (
            <Badge variant="default" className="px-1.5">
              絞り込み適用中
            </Badge>
          )}
        </Button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-5 border-t pt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
            <div className="flex flex-col gap-1">
              <Label htmlFor="aitool-filter">AIツール</Label>
              <select
                id="aitool-filter"
                className="rounded-md border bg-background px-2 py-2 text-sm"
                value={filters.aiTool}
                onChange={(e) => set("aiTool", e.target.value)}
              >
                <option value="all">すべて</option>
                {availableAiTools.map((tool) => (
                  <option key={tool} value={tool}>
                    {tool}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="date-from">期間</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="date-from"
                  type="date"
                  className="w-36"
                  value={filters.dateFrom}
                  onChange={(e) => set("dateFrom", e.target.value)}
                />
                <span className="text-sm text-muted-foreground">〜</span>
                <Input
                  type="date"
                  className="w-36"
                  value={filters.dateTo}
                  onChange={(e) => set("dateTo", e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="sort">並び替え</Label>
              <select
                id="sort"
                className="rounded-md border bg-background px-2 py-2 text-sm"
                value={filters.sort}
                onChange={(e) => set("sort", e.target.value as SortOrder)}
              >
                <option value="newest">新着順</option>
                <option value="oldest">古い順</option>
                <option value="title-asc">タイトル順（昇順）</option>
                <option value="title-desc">タイトル順（降順）</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pb-2">
              <button
                type="button"
                onClick={() => set("favoriteOnly", !filters.favoriteOnly)}
                aria-pressed={filters.favoriteOnly}
                className="flex items-center gap-1.5 text-sm"
              >
                <span className="text-lg leading-none text-favorite">
                  {filters.favoriteOnly ? "★" : "☆"}
                </span>
                お気に入り登録
              </button>
            </div>
          </div>

          {availableTags.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <Label>タグ（複数選択可）</Label>
                {filters.tags.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={() => set("tags", [])}
                  >
                    選択解除
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map((tag) => {
                  const selected = filters.tags.includes(tag.name);
                  const swatch = getTagColorSwatch(tag.color);
                  return (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => toggleTag(tag.name)}
                      aria-pressed={selected}
                    >
                      <Badge
                        variant="outline"
                        style={{
                          backgroundColor: swatch.bg,
                          color: swatch.text,
                          borderColor: "transparent",
                        }}
                        className={selected ? "ring-2 ring-primary" : "opacity-60"}
                      >
                        #{tag.name}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {advancedActive && (
            <div className="flex justify-start">
              <button
                type="button"
                onClick={clearAdvancedFilters}
                className="inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-4xl bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70"
              >
                絞り込み全解除
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
