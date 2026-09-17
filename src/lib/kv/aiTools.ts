import { getCloudflareContext } from "@opennextjs/cloudflare";
import { bulkUpdateItems, listIndex, type BulkItemPatch } from "@/lib/kv/items";
import { AI_TOOL_PRESETS } from "@/lib/constants";

// user:{user_id}:ai-tools にユーザーが使える全AIツール名をJSON配列で保持する
// （tags.tsと同じ「軽量な単一キー」方式）。プリセットも遅延シードすることで、
// プリセットもカスタム項目と同じAPIで改名・削除できるようにする。
const DEFAULT_AI_TOOLS = [...AI_TOOL_PRESETS];

function aiToolsKey(userId: string) {
  return `user:${userId}:ai-tools`;
}

async function saveAiTools(userId: string, names: string[]): Promise<void> {
  const { env } = getCloudflareContext();
  await env.LINKS_KV.put(aiToolsKey(userId), JSON.stringify(names));
}

export async function listAiTools(userId: string): Promise<string[]> {
  const { env } = getCloudflareContext();
  const raw = await env.LINKS_KV.get(aiToolsKey(userId));
  if (raw === null) {
    await saveAiTools(userId, DEFAULT_AI_TOOLS);
    return DEFAULT_AI_TOOLS;
  }
  return JSON.parse(raw) as string[];
}

// アイテムの作成・更新で使われたAIツール名を、ユーザーのAIツール一覧に自動登録する。
// これをしないと、新規作成/編集モーダルで自由入力したAIツールがそのアイテムには
// 保存されるが選択肢には残らず、次回登録時に毎回入力し直す必要が生じる。
export async function ensureAiToolsRegistered(
  userId: string,
  names: string[],
): Promise<void> {
  const tools = await listAiTools(userId);
  const newNames = names.filter((n) => n.trim() !== "" && !tools.includes(n));
  if (newNames.length === 0) return;
  await saveAiTools(userId, [...tools, ...newNames]);
}

export async function renameAiTool(
  userId: string,
  oldName: string,
  newName: string,
): Promise<string[]> {
  const tools = await listAiTools(userId);
  const nextTools = Array.from(
    new Set(tools.map((t) => (t === oldName ? newName : t))),
  );
  await saveAiTools(userId, nextTools);

  const index = await listIndex(userId);
  const changes = new Map<string, BulkItemPatch>();
  for (const entry of index) {
    if (entry.aiTool === oldName) {
      changes.set(entry.id, { aiTool: newName });
    }
  }
  await bulkUpdateItems(userId, changes);

  return nextTools;
}

// アイテム側のaiToolフィールドはあくまで自由入力の1文字列であり、タグのような
// 配列所属ではないため、一覧からの削除はアイテム側の値には影響させない
// （既存アイテムの表示ラベルを意図せず消さないため）。単に選択肢から外れるだけ。
export async function deleteAiTool(userId: string, name: string): Promise<string[]> {
  const tools = await listAiTools(userId);
  const nextTools = tools.filter((t) => t !== name);
  await saveAiTools(userId, nextTools);
  return nextTools;
}

// アカウント削除用: このユーザーのAIツールキー自体を丸ごと削除する。
export async function deleteAllAiTools(userId: string): Promise<void> {
  const { env } = getCloudflareContext();
  await env.LINKS_KV.delete(aiToolsKey(userId));
}
