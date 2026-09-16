import { getCloudflareContext } from "@opennextjs/cloudflare";
import { bulkUpdateItems, listIndex, type BulkItemPatch } from "@/lib/kv/items";

// フォルダはparentIdによる木構造（parentId: nullがルート直下）。
// フラット運用したい場合は全フォルダのparentIdをnullにすればよい。
// items.tsのindexキーと同じ「1ユーザー1キーのJSON配列」方式を踏襲する
// （plan.md 5.3章の既知のトレードオフをそのまま引き継ぐ: 同時書き込み競合は許容）。
export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  createdAt: string;
};

export type FolderPatch = {
  name?: string;
  parentId?: string | null;
};

export type DeleteFolderResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "has_child_folders" };

function foldersKey(userId: string) {
  return `user:${userId}:folders`;
}

export async function listFolders(userId: string): Promise<Folder[]> {
  const { env } = getCloudflareContext();
  const raw = await env.LINKS_KV.get(foldersKey(userId));
  return raw ? (JSON.parse(raw) as Folder[]) : [];
}

async function saveFolders(userId: string, folders: Folder[]): Promise<void> {
  const { env } = getCloudflareContext();
  await env.LINKS_KV.put(foldersKey(userId), JSON.stringify(folders));
}

// newParentIdへ移動するとfolderId自身の子孫の下にぶら下がる（循環）ことにならないか確認する。
function wouldCreateCycle(
  folders: Folder[],
  folderId: string,
  newParentId: string | null,
): boolean {
  let current = newParentId;
  while (current !== null) {
    if (current === folderId) return true;
    current = folders.find((f) => f.id === current)?.parentId ?? null;
  }
  return false;
}

export async function createFolder(
  userId: string,
  input: { name: string; parentId: string | null },
): Promise<Folder | null> {
  const folders = await listFolders(userId);

  if (input.parentId !== null && !folders.some((f) => f.id === input.parentId)) {
    return null; // 存在しない親を指定
  }

  const folder: Folder = {
    id: crypto.randomUUID(),
    name: input.name,
    parentId: input.parentId,
    order: folders.length, // 末尾に追加
    createdAt: new Date().toISOString(),
  };

  folders.push(folder);
  await saveFolders(userId, folders);

  return folder;
}

export async function updateFolder(
  userId: string,
  folderId: string,
  patch: FolderPatch,
): Promise<Folder | null | "invalid_parent" | "cycle"> {
  const folders = await listFolders(userId);
  const existing = folders.find((f) => f.id === folderId);
  if (!existing) return null;

  if (patch.parentId !== undefined && patch.parentId !== null) {
    if (!folders.some((f) => f.id === patch.parentId)) return "invalid_parent";
    if (wouldCreateCycle(folders, folderId, patch.parentId)) return "cycle";
  }

  const updated: Folder = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
  };

  const nextFolders = folders.map((f) => (f.id === folderId ? updated : f));
  await saveFolders(userId, nextFolders);

  return updated;
}

// フォルダを削除する。中に入っているリンクは削除せず、folderIdをnull
// （未分類）に解除するだけにする。子フォルダが残っている場合のみ拒否する
// （階層構造を壊す変更になるため、今回のスコープでは保守的にブロックを維持）。
export async function deleteFolder(
  userId: string,
  folderId: string,
): Promise<DeleteFolderResult> {
  const folders = await listFolders(userId);
  if (!folders.some((f) => f.id === folderId)) {
    return { ok: false, reason: "not_found" };
  }

  if (folders.some((f) => f.parentId === folderId)) {
    return { ok: false, reason: "has_child_folders" };
  }

  const index = await listIndex(userId);
  const changes = new Map<string, BulkItemPatch>();
  for (const entry of index) {
    if (entry.folderId === folderId) {
      changes.set(entry.id, { folderId: null });
    }
  }
  await bulkUpdateItems(userId, changes);

  const nextFolders = folders.filter((f) => f.id !== folderId);
  await saveFolders(userId, nextFolders);

  return { ok: true };
}

// 中身のアイテムが1つも無く、かつ子フォルダも持たないフォルダをまとめて削除する
// （個別削除と同じ「子フォルダが残っている場合は削除しない」制約を踏襲）。
export async function deleteEmptyFolders(userId: string): Promise<string[]> {
  const [folders, index] = await Promise.all([listFolders(userId), listIndex(userId)]);

  const usedFolderIds = new Set(
    index.map((item) => item.folderId).filter((id): id is string => id !== null),
  );
  const parentIds = new Set(
    folders.map((f) => f.parentId).filter((id): id is string => id !== null),
  );

  const emptyIds = folders
    .filter((f) => !usedFolderIds.has(f.id) && !parentIds.has(f.id))
    .map((f) => f.id);
  if (emptyIds.length === 0) return [];

  const remaining = folders.filter((f) => !emptyIds.includes(f.id));
  await saveFolders(userId, remaining);
  return emptyIds;
}

// アカウント削除用: このユーザーのフォルダキー自体を丸ごと削除する。
export async function deleteAllFolders(userId: string): Promise<void> {
  const { env } = getCloudflareContext();
  await env.LINKS_KV.delete(foldersKey(userId));
}

// 任意の順序への並び替え（例: ドラッグ&ドロップ、上下移動ボタン）。
// 呼び出し側は現在の全フォルダIDを希望の順序で過不足なく渡す必要がある。
export async function reorderFolders(
  userId: string,
  orderedIds: string[],
): Promise<Folder[] | "mismatch"> {
  const folders = await listFolders(userId);

  const currentIds = new Set(folders.map((f) => f.id));
  const givenIds = new Set(orderedIds);
  const sameSet =
    currentIds.size === givenIds.size &&
    [...currentIds].every((id) => givenIds.has(id));
  if (!sameSet) return "mismatch";

  const byId = new Map(folders.map((f) => [f.id, f]));
  const reordered = orderedIds.map((id, index) => ({
    ...byId.get(id)!,
    order: index,
  }));

  await saveFolders(userId, reordered);
  return reordered;
}
