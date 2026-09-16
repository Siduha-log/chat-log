import { getCloudflareContext } from "@opennextjs/cloudflare";
import { bulkUpdateItems, listIndex, type BulkItemPatch } from "@/lib/kv/items";

// user:{user_id}:tags にユーザーが使える全タグ名をJSON配列で保持する
// （items.tsのindexと同じ「軽量な単一キー」方式）。
// 初回アクセス時にデフォルトタグを遅延シードすることで、デフォルトタグも
// カスタムタグと同じAPIでリネーム・削除できるようにする。
const DEFAULT_TAGS = ["調査", "相談", "計画"];

function tagsKey(userId: string) {
  return `user:${userId}:tags`;
}

async function saveTags(userId: string, tags: string[]): Promise<void> {
  const { env } = getCloudflareContext();
  await env.LINKS_KV.put(tagsKey(userId), JSON.stringify(tags));
}

export async function listTags(userId: string): Promise<string[]> {
  const { env } = getCloudflareContext();
  const raw = await env.LINKS_KV.get(tagsKey(userId));
  if (raw === null) {
    await saveTags(userId, DEFAULT_TAGS);
    return DEFAULT_TAGS;
  }
  return JSON.parse(raw) as string[];
}

export async function addTag(userId: string, name: string): Promise<string[]> {
  const tags = await listTags(userId);
  if (!tags.includes(name)) {
    tags.push(name);
    await saveTags(userId, tags);
  }
  return tags;
}

export async function renameTag(
  userId: string,
  oldName: string,
  newName: string,
): Promise<string[]> {
  const tags = await listTags(userId);
  const nextTags = Array.from(
    new Set(tags.map((t) => (t === oldName ? newName : t))),
  );
  await saveTags(userId, nextTags);

  const index = await listIndex(userId);
  const changes = new Map<string, BulkItemPatch>();
  for (const entry of index) {
    if (entry.tags.includes(oldName)) {
      changes.set(entry.id, {
        tags: Array.from(new Set(entry.tags.map((t) => (t === oldName ? newName : t)))),
      });
    }
  }
  await bulkUpdateItems(userId, changes);

  return nextTags;
}

// アカウント削除用: このユーザーのタグキー自体を丸ごと削除する。
export async function deleteAllTags(userId: string): Promise<void> {
  const { env } = getCloudflareContext();
  await env.LINKS_KV.delete(tagsKey(userId));
}

export async function deleteTag(userId: string, name: string): Promise<string[]> {
  const tags = await listTags(userId);
  const nextTags = tags.filter((t) => t !== name);
  await saveTags(userId, nextTags);

  const index = await listIndex(userId);
  const changes = new Map<string, BulkItemPatch>();
  for (const entry of index) {
    if (entry.tags.includes(name)) {
      changes.set(entry.id, { tags: entry.tags.filter((t) => t !== name) });
    }
  }
  await bulkUpdateItems(userId, changes);

  return nextTags;
}
