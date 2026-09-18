import { getCloudflareContext } from "@opennextjs/cloudflare";
import { bulkUpdateItems, listIndex, type BulkItemPatch } from "@/lib/kv/items";
import { DEFAULT_TAG_COLOR_ID, type Tag } from "@/lib/tagColors";

export type { Tag };

// user:{user_id}:tags にユーザーが使える全タグ（名前+色）をJSON配列で保持する
// （items.tsのindexと同じ「軽量な単一キー」方式）。
// 初回アクセス時にデフォルトタグを遅延シードすることで、デフォルトタグも
// カスタムタグと同じAPIでリネーム・削除・色変更できるようにする。
const DEFAULT_TAGS: Tag[] = [
  { name: "調査", color: DEFAULT_TAG_COLOR_ID },
  { name: "相談", color: DEFAULT_TAG_COLOR_ID },
  { name: "計画", color: DEFAULT_TAG_COLOR_ID },
];

function tagsKey(userId: string) {
  return `user:${userId}:tags`;
}

async function saveTags(userId: string, tags: Tag[]): Promise<void> {
  const { env } = getCloudflareContext();
  await env.LINKS_KV.put(tagsKey(userId), JSON.stringify(tags));
}

// カラーカスタマイズ導入前の旧形式（string[]）データを新形式に変換する。
function normalizeTags(raw: unknown): Tag[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) =>
    typeof t === "string" ? { name: t, color: DEFAULT_TAG_COLOR_ID } : (t as Tag),
  );
}

export async function listTags(userId: string): Promise<Tag[]> {
  const { env } = getCloudflareContext();
  const raw = await env.LINKS_KV.get(tagsKey(userId));
  if (raw === null) {
    await saveTags(userId, DEFAULT_TAGS);
    return DEFAULT_TAGS;
  }
  const parsed = JSON.parse(raw) as unknown[];
  const tags = normalizeTags(parsed);
  if (parsed.some((t) => typeof t === "string")) {
    // 旧形式だったデータは、以降読み直さなくて済むよう新形式で保存し直す
    await saveTags(userId, tags);
  }
  return tags;
}

export async function addTag(
  userId: string,
  name: string,
  color: string = DEFAULT_TAG_COLOR_ID,
): Promise<Tag[]> {
  const tags = await listTags(userId);
  if (!tags.some((t) => t.name === name)) {
    tags.push({ name, color });
    await saveTags(userId, tags);
  }
  return tags;
}

// アイテムの作成・更新で使われたタグを、ユーザーのタグ一覧に自動登録する。
// これをしないと、新規作成/編集モーダルでその場限り入力したタグが
// アイテムには保存されるが一覧の選択肢には出てこず、他のアイテムで
// 再利用できない（「タグを追加できない」ように見える不具合の原因）。
export async function ensureTagsRegistered(
  userId: string,
  names: string[],
): Promise<void> {
  const tags = await listTags(userId);
  const existing = new Set(tags.map((t) => t.name));
  const newNames = names.filter((n) => n.trim() !== "" && !existing.has(n));
  if (newNames.length === 0) return;
  await saveTags(userId, [
    ...tags,
    ...newNames.map((name) => ({ name, color: DEFAULT_TAG_COLOR_ID })),
  ]);
}

export async function renameTag(
  userId: string,
  oldName: string,
  newName: string,
): Promise<Tag[]> {
  const tags = await listTags(userId);
  const seen = new Set<string>();
  const nextTags: Tag[] = [];
  for (const t of tags) {
    const name = t.name === oldName ? newName : t.name;
    if (seen.has(name)) continue;
    seen.add(name);
    nextTags.push({ ...t, name });
  }
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

export async function setTagColor(
  userId: string,
  name: string,
  color: string,
): Promise<Tag[]> {
  const tags = await listTags(userId);
  const nextTags = tags.map((t) => (t.name === name ? { ...t, color } : t));
  await saveTags(userId, nextTags);
  return nextTags;
}

// アカウント削除用: このユーザーのタグキー自体を丸ごと削除する。
export async function deleteAllTags(userId: string): Promise<void> {
  const { env } = getCloudflareContext();
  await env.LINKS_KV.delete(tagsKey(userId));
}

export async function deleteTag(userId: string, name: string): Promise<Tag[]> {
  const tags = await listTags(userId);
  const nextTags = tags.filter((t) => t.name !== name);
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
