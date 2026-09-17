import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { createItem, listIndex, type NewItemInput } from "@/lib/kv/items";
import { listFolders } from "@/lib/kv/folders";
import { ensureTagsRegistered } from "@/lib/kv/tags";
import { ensureAiToolsRegistered } from "@/lib/kv/aiTools";
import { CONTENT_MAX_LENGTH } from "@/lib/constants";

export async function GET(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const items = await listIndex(userId);

  const folderId = new URL(request.url).searchParams.get("folderId");
  if (folderId === null) {
    return NextResponse.json({ items });
  }

  const target = folderId === "unfiled" ? null : folderId;
  return NextResponse.json({
    items: items.filter((item) => item.folderId === target),
  });
}

function parseNewItemInput(
  body: unknown,
): Omit<NewItemInput, "folderId"> | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.shareUrl !== "string" || b.shareUrl.trim() === "") return null;

  return {
    title: typeof b.title === "string" ? b.title : "",
    shareUrl: b.shareUrl,
    contentText:
      typeof b.contentText === "string"
        ? b.contentText.slice(0, CONTENT_MAX_LENGTH)
        : "",
    memo: typeof b.memo === "string" ? b.memo : "",
    tags: Array.isArray(b.tags)
      ? b.tags.filter((t): t is string => typeof t === "string")
      : [],
    aiTool: typeof b.aiTool === "string" ? b.aiTool : "",
    favorite: typeof b.favorite === "boolean" ? b.favorite : false,
  };
}

export async function POST(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const input = parseNewItemInput(body);
  if (!input) {
    return NextResponse.json(
      { error: "shareUrl is required" },
      { status: 400 },
    );
  }

  const b = body as Record<string, unknown>;
  const folderId = typeof b.folderId === "string" ? b.folderId : null;

  if (folderId !== null) {
    const folders = await listFolders(userId);
    if (!folders.some((f) => f.id === folderId)) {
      return NextResponse.json(
        { error: "folderId does not exist" },
        { status: 400 },
      );
    }
  }

  const item = await createItem(userId, { ...input, folderId });
  if (item.tags.length > 0) {
    await ensureTagsRegistered(userId, item.tags);
  }
  if (item.aiTool.trim() !== "") {
    await ensureAiToolsRegistered(userId, [item.aiTool]);
  }
  return NextResponse.json({ item }, { status: 201 });
}
