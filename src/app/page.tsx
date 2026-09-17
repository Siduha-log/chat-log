"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { apiGet, apiSend } from "@/lib/api/client";
import type { IndexEntry, LinkItem } from "@/lib/kv/items";
import type { Folder } from "@/lib/kv/folders";
import { ITEMS_PER_PAGE } from "@/lib/constants";
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
import { AiToolPanel } from "@/components/aiTools/AiToolPanel";
import { FilterBar, defaultFilters, type Filters } from "@/components/FilterBar";
import { Pagination } from "@/components/Pagination";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ResizableSidebar } from "@/components/ResizableSidebar";
import { SettingsButton } from "@/components/SettingsButton";

type EditingState = { mode: "closed" } | { mode: "new" } | { mode: "edit"; item: LinkItem };
type MergeRequest = { draggedId: string; targetId: string };

export default function Home() {
  const [authChecked, setAuthChecked] = useState(false);
  const [items, setItems] = useState<IndexEntry[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [aiTools, setAiTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFolder, setSelectedFolder] = useState<string | null | "all">("all");
  const [folderSortMode, setFolderSortMode] = useState<FolderSortMode>("custom");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [editing, setEditing] = useState<EditingState>({ mode: "closed" });
  const [showTagManager, setShowTagManager] = useState(false);
  const [showAiToolManager, setShowAiToolManager] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [mergeRequest, setMergeRequest] = useState<MergeRequest | null>(null);

  // Android共有シート(/share)経由の遷移で ?shareUrl=... が付いていた場合の
  // プリフィル値。新規登録フォームのinitialに渡す（4章参照）。
  const [pendingShareUrl, setPendingShareUrl] = useState<string | null>(null);

  // indexの`contentSnippet`(先頭300文字)には無い、本文の奥の方にしか出てこない
  // キーワード用のサーバー全文検索結果。null = 未検索（クエリ空、または未確定）。
  const [contentMatchIds, setContentMatchIds] = useState<Set<string> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = filters.query.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);

    // クエリが空の場合も即座にsetStateせず、他の分岐と同じくタイマー経由の
    // 非同期コールバック内でsetStateする（エフェクト本体での同期的setStateを避ける）。
    searchTimer.current = setTimeout(
      async () => {
        if (!q) {
          setContentMatchIds(null);
          return;
        }
        try {
          const { ids } = await apiGet<{ ids: string[] }>(
            `/api/search?q=${encodeURIComponent(q)}`,
          );
          setContentMatchIds(new Set(ids));
        } catch {
          // 全文検索は上積み機能のため、失敗してもタイトル/メモ/スニペット一致の
          // 結果はそのまま表示され続ける（サイレントに諦める）
        }
      },
      q ? 400 : 0,
    );

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [filters.query]);

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
      const [itemsRes, foldersRes, tagsRes, aiToolsRes] = await Promise.all([
        apiGet<{ items: IndexEntry[] }>("/api/items"),
        apiGet<{ folders: Folder[] }>("/api/folders"),
        apiGet<{ tags: string[] }>("/api/tags"),
        apiGet<{ aiTools: string[] }>("/api/ai-tools"),
      ]);
      setItems(itemsRes.items);
      setFolders(foldersRes.folders);
      setTags(tagsRes.tags);
      setAiTools(aiToolsRes.aiTools);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authChecked) return;
    const shareUrl = new URLSearchParams(window.location.search).get("shareUrl");
    if (!shareUrl) return;

    // エフェクト本体での同期的setStateを避けるため、他の箇所と同様に
    // タイマー経由のコールバック内でsetStateする。
    const timer = setTimeout(() => {
      setPendingShareUrl(shareUrl);
      setEditing({ mode: "new" });
      window.history.replaceState(null, "", window.location.pathname);
    }, 0);
    return () => clearTimeout(timer);
  }, [authChecked]);

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

  // 中身のアイテムが1つも無く、かつ子フォルダも持たないフォルダのid一覧
  // （空フォルダ一括削除ボタンの表示件数・無効化判定に使う）。
  const emptyFolderIds = useMemo(() => {
    const used = new Set(items.map((i) => i.folderId).filter((id): id is string => id !== null));
    const parents = new Set(
      folders.map((f) => f.parentId).filter((id): id is string => id !== null),
    );
    return folders.filter((f) => !used.has(f.id) && !parents.has(f.id)).map((f) => f.id);
  }, [items, folders]);

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
          i.contentSnippet.toLowerCase().includes(q) ||
          (contentMatchIds?.has(i.id) ?? false),
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
  }, [items, selectedFolder, filters, contentMatchIds]);

  // 一覧が長くなりすぎないよう1ページ20件に区切って表示する。
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / ITEMS_PER_PAGE));
  const pagedItems = useMemo(
    () => visibleItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [visibleItems, currentPage],
  );

  // フォルダ選択・検索・絞り込みの条件が変わったら1ページ目に戻す。
  // （レンダー中の条件付きsetStateによる状態調整。Reactの推奨パターンで、
  // useEffect内での無条件setStateを避けるルールにも抵触しない）
  const [paginationDeps, setPaginationDeps] = useState({ selectedFolder, filters, contentMatchIds });
  if (
    paginationDeps.selectedFolder !== selectedFolder ||
    paginationDeps.filters !== filters ||
    paginationDeps.contentMatchIds !== contentMatchIds
  ) {
    setPaginationDeps({ selectedFolder, filters, contentMatchIds });
    setCurrentPage(1);
  }

  // --- item handlers ---

  const handleCreateOrUpdateItem = async (values: ItemFormValues) => {
    if (editing.mode === "edit") {
      await apiSend(`/api/items/${editing.item.id}`, "PATCH", values);
    } else {
      await apiSend("/api/items", "POST", values);
    }
    setEditing({ mode: "closed" });
    setPendingShareUrl(null);
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
  const handleDeleteEmptyFolders = async () => {
    if (emptyFolderIds.length === 0) return;
    if (!window.confirm(`空のフォルダを${emptyFolderIds.length}件削除しますか？`)) return;
    try {
      await apiSend("/api/folders/delete-empty", "DELETE");
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  // --- drag & drop: テーブル行同士を重ねたら新規フォルダ作成、
  //     フォルダ一覧に重ねたら既存フォルダへ直接移動 ---

  const handleMergeIntoNewFolder = (draggedId: string, targetId: string) => {
    setMergeRequest({ draggedId, targetId });
  };

  const handleConfirmMerge = async (name: string) => {
    if (!mergeRequest) return;
    try {
      const { folder } = await apiSend<{ folder: Folder }>("/api/folders", "POST", { name });
      // 2件のfolderId更新は個別PATCHの並列呼び出しにしない。indexキーへの
      // read-modify-writeが競合し、後勝ちで片方の更新が消えるため
      // （src/lib/kv/items.tsのbulkUpdateItemsのコメント参照）。
      await apiSend("/api/items/bulk", "PATCH", {
        ids: [mergeRequest.draggedId, mergeRequest.targetId],
        patch: { folderId: folder.id },
      });
      setMergeRequest(null);
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "フォルダの作成に失敗しました");
    }
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

  // --- AIツール handlers ---

  const handleCreateAiTool = async (name: string) => {
    await apiSend("/api/ai-tools", "POST", { name });
    await reload();
  };
  const handleRenameAiTool = async (oldName: string, newName: string) => {
    await apiSend("/api/ai-tools", "PATCH", { oldName, newName });
    await reload();
  };
  const handleDeleteAiTool = async (name: string) => {
    if (!window.confirm(`AIツール「${name}」を選択肢から削除しますか？`)) return;
    await apiSend("/api/ai-tools", "DELETE", { name });
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
    <div className="flex h-full flex-col gap-6">
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
        emptyFolderCount={emptyFolderIds.length}
        onDeleteEmptyFolders={handleDeleteEmptyFolders}
      />

      <div>
        <button
          type="button"
          className="text-sm underline"
          onClick={() => setShowAiToolManager((v) => !v)}
        >
          {showAiToolManager ? "AIツール管理を閉じる" : "AIツール管理を開く"}
        </button>
        {showAiToolManager && (
          <div className="mt-2">
            <AiToolPanel
              aiTools={aiTools}
              onCreate={handleCreateAiTool}
              onRename={handleRenameAiTool}
              onDelete={handleDeleteAiTool}
            />
          </div>
        )}
      </div>

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

      <div className="mt-auto pt-4">
        <SettingsButton />
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
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 text-xl md:hidden"
                  aria-label="フォルダを開く"
                />
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
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            <button
              type="button"
              className="cursor-pointer transition-opacity hover:opacity-70"
              onClick={() => {
                setSelectedFolder("all");
                setFilters(defaultFilters);
                setSidebarOpen(false);
                setEditing({ mode: "closed" });
                setPendingShareUrl(null);
                // フォルダ・絞り込み条件が既に初期値の場合、その変更検知に連動する
                // ページリセットのロジック（下記paginationDeps）が発火しないため、
                // ページネーションの位置は明示的にリセットする。
                setCurrentPage(1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              ChatHub
            </button>
          </h1>
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
            onClick={() => {
              setEditing((cur) => (cur.mode === "new" ? { mode: "closed" } : { mode: "new" }));
              setPendingShareUrl(null);
            }}
            className="self-start"
          >
            {editing.mode === "new" ? "閉じる" : "+ 新規登録"}
          </Button>

          {editing.mode !== "closed" && (
            <ItemForm
              key={editing.mode === "edit" ? editing.item.id : "new"}
              initial={
                editing.mode === "edit"
                  ? editing.item
                  : pendingShareUrl
                    ? { shareUrl: pendingShareUrl }
                    : undefined
              }
              folders={folders}
              availableTags={tags}
              availableAiTools={aiTools}
              onCancel={() => {
                setEditing({ mode: "closed" });
                setPendingShareUrl(null);
              }}
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
            <>
              <ItemTable
                items={pagedItems}
                folderNameById={folderNameById}
                draggedItemId={draggedItemId}
                onDragStart={setDraggedItemId}
                onDragEnd={() => setDraggedItemId(null)}
                onMergeIntoNewFolder={handleMergeIntoNewFolder}
                onToggleFavorite={handleToggleFavorite}
                onEdit={startEdit}
                onDelete={handleDeleteItem}
              />
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </main>
      </div>

      <CreateFolderDialog
        key={mergeRequest ? `${mergeRequest.draggedId}:${mergeRequest.targetId}` : "closed"}
        open={mergeRequest !== null}
        onOpenChange={(open) => {
          if (!open) setMergeRequest(null);
        }}
        onConfirm={handleConfirmMerge}
      />
    </div>
  );
}
