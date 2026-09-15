"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { apiGet, apiSend } from "@/lib/api/client";
import type { IndexEntry, LinkItem } from "@/lib/kv/items";
import type { Folder } from "@/lib/kv/folders";
import { Button } from "@/components/ui/button";
import { ItemCard } from "@/components/items/ItemCard";
import { ItemForm, type ItemFormValues } from "@/components/items/ItemForm";
import { FolderPanel } from "@/components/folders/FolderPanel";
import { TagPanel } from "@/components/tags/TagPanel";
import { FilterBar, defaultFilters, type Filters } from "@/components/FilterBar";

type EditingState = { mode: "closed" } | { mode: "new" } | { mode: "edit"; item: LinkItem };

export default function Home() {
  const [authChecked, setAuthChecked] = useState(false);
  const [items, setItems] = useState<IndexEntry[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFolder, setSelectedFolder] = useState<string | null | "all">("all");
  const [folderSortMode, setFolderSortMode] = useState<"custom" | "name">("custom");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [editing, setEditing] = useState<EditingState>({ mode: "closed" });
  const [showTagManager, setShowTagManager] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/login";
        return;
      }
      setAuthChecked(true);
    })();
  }, []);

  // 初回はuseState(true)の初期値でローディング表示する。再読み込み時
  // （ミューテーション後）はここでloading=trueに戻さず、表示中のデータを
  // 保ったまま裏で更新する（エフェクト内での同期的setStateを避ける意味もある）。
  const reload = async () => {
    try {
      const [itemsRes, foldersRes, tagsRes] = await Promise.all([
        apiGet<{ items: IndexEntry[] }>("/api/items"),
        apiGet<{ folders: Folder[] }>("/api/folders"),
        apiGet<{ tags: string[] }>("/api/tags"),
      ]);
      setItems(itemsRes.items);
      setFolders(foldersRes.folders);
      setTags(tagsRes.tags);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // マウント時のデータ取得。reload()内のsetStateは常にawait後（catch/finally含む）
    // にしか走らないため実質的に問題ないが、このルールは関数境界をまたいだ
    // 静的解析までは行えないため誤検知する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (authChecked) reload();
  }, [authChecked]);

  const availableAiTools = useMemo(
    () => Array.from(new Set(items.map((i) => i.aiTool).filter(Boolean))).sort(),
    [items],
  );

  const folderNameById = useMemo(
    () => new Map(folders.map((f) => [f.id, f.name])),
    [folders],
  );

  const visibleItems = useMemo(() => {
    let result = items;

    if (selectedFolder === null) {
      result = result.filter((i) => i.folderId === null);
    } else if (selectedFolder !== "all") {
      result = result.filter((i) => i.folderId === selectedFolder);
    }

    if (filters.tag !== "all") {
      result = result.filter((i) => i.tags.includes(filters.tag));
    }
    if (filters.aiTool !== "all") {
      result = result.filter((i) => i.aiTool === filters.aiTool);
    }
    if (filters.favoriteOnly) {
      result = result.filter((i) => i.favorite);
    }
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom).getTime();
      result = result.filter((i) => new Date(i.createdAt).getTime() >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo).getTime() + 24 * 60 * 60 * 1000 - 1;
      result = result.filter((i) => new Date(i.createdAt).getTime() <= to);
    }
    if (filters.query.trim()) {
      const q = filters.query.trim().toLowerCase();
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.memo.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q)) ||
          i.aiTool.toLowerCase().includes(q) ||
          i.contentSnippet.toLowerCase().includes(q),
      );
    }

    result = [...result].sort((a, b) => {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      return filters.sort === "newest" ? db - da : da - db;
    });

    return result;
  }, [items, selectedFolder, filters]);

  // --- item handlers ---

  const handleCreateOrUpdateItem = async (values: ItemFormValues) => {
    if (editing.mode === "edit") {
      await apiSend(`/api/items/${editing.item.id}`, "PATCH", values);
    } else {
      await apiSend("/api/items", "POST", values);
    }
    setEditing({ mode: "closed" });
    await reload();
  };

  const startEdit = async (id: string) => {
    const { item } = await apiGet<{ item: LinkItem }>(`/api/items/${id}`);
    setEditing({ mode: "edit", item });
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm("削除しますか？")) return;
    await apiSend(`/api/items/${id}`, "DELETE");
    await reload();
  };

  const handleToggleFavorite = async (id: string, next: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, favorite: next } : i)));
    try {
      await apiSend(`/api/items/${id}`, "PATCH", { favorite: next });
    } catch {
      await reload();
    }
  };

  // --- folder handlers ---

  const handleCreateFolder = async (name: string) => {
    await apiSend("/api/folders", "POST", { name });
    await reload();
  };
  const handleRenameFolder = async (id: string, name: string) => {
    await apiSend(`/api/folders/${id}`, "PATCH", { name });
    await reload();
  };
  const handleDeleteFolder = async (id: string) => {
    if (!window.confirm("このフォルダを削除しますか？（中身が空の場合のみ削除できます）")) return;
    try {
      await apiSend(`/api/folders/${id}`, "DELETE");
      if (selectedFolder === id) setSelectedFolder("all");
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };
  const handleReorderFolders = async (orderedIds: string[]) => {
    await apiSend("/api/folders/reorder", "PATCH", { orderedIds });
    await reload();
  };

  // --- tag handlers ---

  const handleCreateTag = async (name: string) => {
    await apiSend("/api/tags", "POST", { name });
    await reload();
  };
  const handleRenameTag = async (oldName: string, newName: string) => {
    await apiSend("/api/tags", "PATCH", { oldName, newName });
    await reload();
  };
  const handleDeleteTag = async (name: string) => {
    if (!window.confirm(`タグ「${name}」を削除しますか？`)) return;
    await apiSend("/api/tags", "DELETE", { name });
    await reload();
  };

  const handleExport = async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/export", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-link-manager-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (!authChecked) {
    return <div className="flex flex-1 items-center justify-center">読み込み中...</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">AI Link Manager</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            JSONエクスポート
          </Button>
          <Button variant="outline" onClick={handleLogout}>
            ログアウト
          </Button>
        </div>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-4 md:flex-row">
        <aside className="flex w-full flex-col gap-6 md:w-56 md:shrink-0">
          <FolderPanel
            folders={folders}
            selected={selectedFolder}
            sortMode={folderSortMode}
            onSortModeChange={setFolderSortMode}
            onSelect={setSelectedFolder}
            onCreate={handleCreateFolder}
            onRename={handleRenameFolder}
            onDelete={handleDeleteFolder}
            onReorder={handleReorderFolders}
          />

          <div>
            <button
              type="button"
              className="text-sm underline"
              onClick={() => setShowTagManager((v) => !v)}
            >
              {showTagManager ? "タグ管理を閉じる" : "タグ管理を開く"}
            </button>
            {showTagManager && (
              <div className="mt-2">
                <TagPanel
                  tags={tags}
                  onCreate={handleCreateTag}
                  onRename={handleRenameTag}
                  onDelete={handleDeleteTag}
                />
              </div>
            )}
          </div>
        </aside>

        <main className="flex flex-1 flex-col gap-4">
          {editing.mode === "closed" ? (
            <Button onClick={() => setEditing({ mode: "new" })}>+ 新規登録</Button>
          ) : (
            <ItemForm
              key={editing.mode === "edit" ? editing.item.id : "new"}
              initial={editing.mode === "edit" ? editing.item : undefined}
              folders={folders}
              availableTags={tags}
              onCancel={() => setEditing({ mode: "closed" })}
              onSubmit={handleCreateOrUpdateItem}
            />
          )}

          <FilterBar
            filters={filters}
            onChange={setFilters}
            availableTags={tags}
            availableAiTools={availableAiTools}
          />

          {loading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : visibleItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">該当するリンクがありません。</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  folderName={item.folderId ? folderNameById.get(item.folderId) ?? null : null}
                  onToggleFavorite={handleToggleFavorite}
                  onEdit={startEdit}
                  onDelete={handleDeleteItem}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
