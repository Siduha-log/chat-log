"use client";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type SortOrder = "newest" | "oldest";

export type Filters = {
  query: string;
  tag: string | "all";
  aiTool: string | "all";
  favoriteOnly: boolean;
  dateFrom: string; // yyyy-mm-dd or ""
  dateTo: string;
  sort: SortOrder;
};

export const defaultFilters: Filters = {
  query: "",
  tag: "all",
  aiTool: "all",
  favoriteOnly: false,
  dateFrom: "",
  dateTo: "",
  sort: "newest",
};

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
  availableTags: string[];
  availableAiTools: string[];
};

export function FilterBar({ filters, onChange, availableTags, availableAiTools }: Props) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="search">検索</Label>
        <Input
          id="search"
          placeholder="タイトル・メモ・タグ・本文で検索"
          value={filters.query}
          onChange={(e) => set("query", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="tag-filter">タグ</Label>
        <select
          id="tag-filter"
          className="rounded-md border bg-background px-2 py-2 text-sm"
          value={filters.tag}
          onChange={(e) => set("tag", e.target.value)}
        >
          <option value="all">すべて</option>
          {availableTags.map((tag) => (
            <option key={tag} value={tag}>
              #{tag}
            </option>
          ))}
        </select>
      </div>

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
          onChange={(e) => set("sort", e.target.value as "newest" | "oldest")}
        >
          <option value="newest">新着順</option>
          <option value="oldest">古い順</option>
        </select>
      </div>

      <div className="flex items-center gap-2 pb-2">
        <Checkbox
          id="favorite-only"
          checked={filters.favoriteOnly}
          onCheckedChange={(c) => set("favoriteOnly", c === true)}
        />
        <Label htmlFor="favorite-only">★のみ</Label>
      </div>
    </div>
  );
}
