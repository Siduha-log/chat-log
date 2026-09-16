import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { bulkUpdateItems, type BulkItemPatch } from "@/lib/kv/items";
import { listFolders } from "@/lib/kv/folders";

function parseBulkPatch(body: unknown): BulkItemPatch | "invalid" {
  if (typeof body !== "object" || body === null) return "invalid";
  const b = body as Record<string, unknown>;

  const patch: BulkItemPatch = {};
  if (typeof b.title === "string") patch.title = b.title;
  if (typeof b.shareUrl === "string") patch.shareUrl = b.shareUrl;
  if (typeof b.memo === "string") patch.memo = b.memo;
  if (Array.isArray(b.tags)) {
    patch.tags = b.tags.filter((t): t is string => typeof t === "string");
  }
  if (typeof b.aiTool === "string") patch.aiTool = b.aiTool;
  if (typeof b.favorite === "boolean") patch.favorite = b.favorite;
  if ("folderId" in b) {
    if (b.folderId === null || typeof b.folderId === "string") {
      patch.folderId = b.folderId;
    } else {
      return "invalid";
    }
  }
  return patch;
}

// 複数アイテムへ同一のpatchを一度に適用する。フォルダD&Dでの新規フォルダ作成のように
// 「複数アイテムのfolderIdを同時に更新する」操作を、個別PATCHの並列呼び出し
// （indexキーへの非アトミックなread-modify-writeが競合し、後勝ちで一部の更新が
// 消える）ではなく`bulkUpdateItems`（indexへの書き込みを最後に1回だけにまとめる）
// 経由で行うためのエンドポイント。
export async function PATCH(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  if (
    !Array.isArray(b.ids) ||
    b.ids.length === 0 ||
    !b.ids.every((id): id is string => typeof id === "string")
  ) {
    return NextResponse.json({ error: "ids is required" }, { status: 400 });
  }

  const patch = parseBulkPatch(b.patch);
  if (patch === "invalid") {
    return NextResponse.json({ error: "invalid patch" }, { status: 400 });
  }

  if (patch.folderId != null) {
    const folders = await listFolders(userId);
    if (!folders.some((f) => f.id === patch.folderId)) {
      return NextResponse.json({ error: "folderId does not exist" }, { status: 400 });
    }
  }

  const ids = b.ids as string[];
  await bulkUpdateItems(userId, new Map(ids.map((id) => [id, patch])));

  return new NextResponse(null, { status: 204 });
}
