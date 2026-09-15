import { getCloudflareContext } from "@opennextjs/cloudflare";

// plan.md 5章: user:{user_id}:items:{item_id} に本体、
// user:{user_id}:index に軽量メタデータ一覧を持つ二段構成。
// 5.3章の既知のトレードオフ（同時書き込み競合・部分失敗）は許容し、
// 自動復旧の仕組みは持たない。

export type LinkItem = {
  id: string;
  title: string;
  shareUrl: string;
  contentText: string;
  memo: string;
  tags: string[];
  folderId: string | null;
  createdAt: string;
};

// 一覧・検索・タグフィルター用の軽量版。contentText(本文)は含めない。
export type IndexEntry = Omit<LinkItem, "contentText">;

export type NewItemInput = Omit<LinkItem, "id" | "createdAt">;
export type ItemPatch = Partial<NewItemInput>;

function itemKey(userId: string, itemId: string) {
  return `user:${userId}:items:${itemId}`;
}

function indexKey(userId: string) {
  return `user:${userId}:index`;
}

function toIndexEntry(item: LinkItem): IndexEntry {
  const { contentText: _contentText, ...rest } = item;
  return rest;
}

export async function listIndex(userId: string): Promise<IndexEntry[]> {
  const { env } = getCloudflareContext();
  const raw = await env.LINKS_KV.get(indexKey(userId));
  return raw ? (JSON.parse(raw) as IndexEntry[]) : [];
}

export async function getItem(
  userId: string,
  itemId: string,
): Promise<LinkItem | null> {
  const { env } = getCloudflareContext();
  const raw = await env.LINKS_KV.get(itemKey(userId, itemId));
  return raw ? (JSON.parse(raw) as LinkItem) : null;
}

export async function createItem(
  userId: string,
  input: NewItemInput,
): Promise<LinkItem> {
  const { env } = getCloudflareContext();

  const item: LinkItem = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };

  await env.LINKS_KV.put(itemKey(userId, item.id), JSON.stringify(item));

  const index = await listIndex(userId);
  index.unshift(toIndexEntry(item));
  await env.LINKS_KV.put(indexKey(userId), JSON.stringify(index));

  return item;
}

export async function updateItem(
  userId: string,
  itemId: string,
  patch: ItemPatch,
): Promise<LinkItem | null> {
  const existing = await getItem(userId, itemId);
  if (!existing) return null;

  const updated: LinkItem = { ...existing, ...patch };

  const { env } = getCloudflareContext();
  await env.LINKS_KV.put(itemKey(userId, itemId), JSON.stringify(updated));

  const index = await listIndex(userId);
  const nextIndex = index.map((entry) =>
    entry.id === itemId ? toIndexEntry(updated) : entry,
  );
  await env.LINKS_KV.put(indexKey(userId), JSON.stringify(nextIndex));

  return updated;
}

export async function deleteItem(userId: string, itemId: string): Promise<void> {
  const { env } = getCloudflareContext();
  await env.LINKS_KV.delete(itemKey(userId, itemId));

  const index = await listIndex(userId);
  const nextIndex = index.filter((entry) => entry.id !== itemId);
  await env.LINKS_KV.put(indexKey(userId), JSON.stringify(nextIndex));
}

// フォルダ削除時のガード（folders.ts参照）に使う。
export async function hasItemsInFolder(
  userId: string,
  folderId: string,
): Promise<boolean> {
  const index = await listIndex(userId);
  return index.some((entry) => entry.folderId === folderId);
}

// plan.md 5.4章 方式(A): エクスポート時のみ全件を個別キーからフェッチする。
export async function exportAllItems(userId: string): Promise<LinkItem[]> {
  const { env } = getCloudflareContext();
  const index = await listIndex(userId);

  const items = await Promise.all(
    index.map((entry) => env.LINKS_KV.get(itemKey(userId, entry.id))),
  );

  return items
    .filter((raw): raw is string => raw !== null)
    .map((raw) => JSON.parse(raw) as LinkItem);
}
