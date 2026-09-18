import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { deleteItem, getItem, updateItem, type ItemPatch } from "@/lib/kv/items";
import { listFolders } from "@/lib/kv/folders";
import { ensureTagsRegistered } from "@/lib/kv/tags";
import { ensureAiToolsRegistered } from "@/lib/kv/aiTools";
import { MEMO_MAX_LENGTH, TITLE_MAX_LENGTH } from "@/lib/constants";

type RouteContext = { params: Promise<{ id: string }> };

function parseItemPatch(body: unknown): ItemPatch | "invalid_folder_id" {
  if (typeof body !== "object" || body === null) return {};
  const b = body as Record<string, unknown>;

  const patch: ItemPatch = {};
  if (typeof b.title === "string") patch.title = b.title.slice(0, TITLE_MAX_LENGTH);
  if (typeof b.shareUrl === "string") patch.shareUrl = b.shareUrl;
  if (typeof b.contentText === "string") patch.contentText = b.contentText;
  if (typeof b.memo === "string") patch.memo = b.memo.slice(0, MEMO_MAX_LENGTH);
  if (Array.isArray(b.tags)) {
    patch.tags = b.tags.filter((t): t is string => typeof t === "string");
  }
  if (typeof b.aiTool === "string") patch.aiTool = b.aiTool;
  if (typeof b.favorite === "boolean") patch.favorite = b.favorite;
  if ("folderId" in b) {
    if (b.folderId === null || typeof b.folderId === "string") {
      patch.folderId = b.folderId;
    } else {
      return "invalid_folder_id";
    }
  }
  return patch;
}

export async function GET(request: Request, { params }: RouteContext) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const item = await getItem(userId, id);
  if (!item) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const patch = parseItemPatch(body);

  if (patch === "invalid_folder_id") {
    return NextResponse.json({ error: "invalid folderId" }, { status: 400 });
  }

  if (patch.folderId != null) {
    const folders = await listFolders(userId);
    if (!folders.some((f) => f.id === patch.folderId)) {
      return NextResponse.json(
        { error: "folderId does not exist" },
        { status: 400 },
      );
    }
  }

  const updated = await updateItem(userId, id, patch);
  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (patch.tags && patch.tags.length > 0) {
    await ensureTagsRegistered(userId, patch.tags);
  }
  if (patch.aiTool && patch.aiTool.trim() !== "") {
    await ensureAiToolsRegistered(userId, [patch.aiTool]);
  }

  return NextResponse.json({ item: updated });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await deleteItem(userId, id);
  return new NextResponse(null, { status: 204 });
}
