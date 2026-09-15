"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { apiGet, apiSend } from "@/lib/api/client";
import type { IndexEntry, LinkItem } from "@/lib/kv/items";
import type { Folder } from "@/lib/kv/folders";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ItemTable } from "@/components/items/ItemTable";
import { ItemForm, type ItemFormValues } from "@/components/items/ItemForm";
import { FolderPanel, type FolderSortMode } from "@/components/folders/FolderPanel";
import { CreateFolderDialog } from "@/components/folders/CreateFolderDialog";
import { TagPanel } from "@/components/tags/TagPanel";
import { FilterBar, defaultFilters, type Filters } from "@/components/FilterBar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ResizableSidebar } from "@/components/ResizableSidebar";

type EditingState = { mode: "closed" } | { mode: "new" } | { mode: "edit"; item: LinkItem };
type MergeRequest = { draggedId: string; targetId: string };

export default function Home() {
  const [authChecked, setAuthChecked] = useState(false);
  const [items, setItems] = useState<IndexEntry[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFolder, setSelectedFolder] = useState<string | null | "all">("all");
  const [folderSortMode, setFolderSortMode] = useState<FolderSortMode>("custom");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [editing, setEditing] = useState<EditingState>({ mode: "closed" });
  const [showTagManager, setShowTagManager] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [mergeRequest, setMergeRequest] = useState<MergeRequest | null>(null);

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

    if (filters.tags.length > 0) {
      result = result.filter((i) => i.tags.some((t) => filters.tags.includes(t)));
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
      switch (filters.sort) {
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "title-asc":
          return (a.title || a.shareUrl).localeCompare(b.title || b.shareUrl, "ja");
        case "title-desc":
          return (b.title || b.shareUrl).localeCompare(a.title || a.shareUrl, "ja");
      }
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
    if (
      !window.confirm(
        "このフォルダを削除しますか？中身のリンクは削除されず「未分類」になります（子フォルダが残っている場合は削除できません）。",
      )
    )
      return;
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

  // --- drag & drop: テーブル行同士を重ねたら新規フォルダ作成、
  //     フォルダ一覧に重ねたら既存フォルダへ直接移動 ---

  const handleMergeIntoNewFolder = (draggedId: string, targetId: string) => {
    setMergeRequest({ draggedId, targetId });
  };

  const handleConfirmMerge = async (name: string) => {
    if (!mergeRequest) return;
    const { folder } = await apiSend<{ folder: Folder }>("/api/folders", "POST", { name });
    await Promise.all([
      apiSend(`/api/items/${mergeRequest.draggedId}`, "PATCH", { folderId: folder.id }),
      apiSend(`/api/items/${mergeRequest.targetId}`, "PATCH", { folderId: folder.id }),
    ]);
    setMergeRequest(null);
    await reload();
  };

  const handleDropItemOnFolder = async (folderId: string | null) => {
    if (!draggedItemId) return;
    await apiSend(`/api/items/${draggedItemId}`, "PATCH", { folderId });
    setDraggedItemId(null);
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

  const sidebarContent = (
    <div className="flex flex-col gap-6">
      <FolderPanel
        folders={folders}
        selected={selectedFolder}
        sortMode={folderSortMode}
        draggedItemId={draggedItemId}
        onSortModeChange={setFolderSortMode}
        onSelect={(id) => {
          setSelectedFolder(id);
          setSidebarOpen(false);
        }}
        onCreate={handleCreateFolder}
        onRename={handleRenameFolder}
        onDelete={handleDeleteFolder}
        onReorder={handleReorderFolders}
        onDropItem={handleDropItemOnFolder}
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
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-3 sm:p-4 lg:px-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger
              render={
                <Button variant="outline" size="icon" className="md:hidden" aria-label="フォルダを開く" />
              }
            >
              ☰
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 p-4 pt-14">
              <SheetHeader className="sr-only">
                <SheetTitle>フォルダ</SheetTitle>
              </SheetHeader>
              {sidebarContent}
            </SheetContent>
          </Sheet>
          <h1 className="text-lg font-semibold sm:text-xl">AI Link Manager</h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={handleExport}>
            エクスポート
          </Button>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            ログアウト
          </Button>
        </div>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-4 md:flex-row">
        <aside className="hidden md:block">
          <ResizableSidebar>{sidebarContent}</ResizableSidebar>
        </aside>

        <main className="flex flex-1 flex-col gap-4">
          <Button
            variant={editing.mode === "new" ? "outline" : "default"}
            onClick={() =>
              setEditing((cur) => (cur.mode === "new" ? { mode: "closed" } : { mode: "new" }))
            }
            className="self-start"
          >
            {editing.mode === "new" ? "閉じる" : "+ 新規登録"}
          </Button>

          {editing.mode !== "closed" && (
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
            <ItemTable
              items={visibleItems}
              folderNameById={folderNameById}
              draggedItemId={draggedItemId}
              onDragStart={setDraggedItemId}
              onDragEnd={() => setDraggedItemId(null)}
              onMergeIntoNewFolder={handleMergeIntoNewFolder}
              onToggleFavorite={handleToggleFavorite}
              onEdit={startEdit}
              onDelete={handleDeleteItem}
            />
          )}
        </main>
      </div>

      <CreateFolderDialog
        open={mergeRequest !== null}
        onOpenChange={(open) => {
          if (!open) setMergeRequest(null);
        }}
        onConfirm={handleConfirmMerge}
      />
    </div>
  );
}
