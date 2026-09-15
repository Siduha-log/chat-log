import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { addTag, deleteTag, listTags, renameTag } from "@/lib/kv/tags";

export async function GET(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tags = await listTags(userId);
  return NextResponse.json({ tags });
}

export async function POST(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = (body as { name?: unknown } | null)?.name;
  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const tags = await addTag(userId, name);
  return NextResponse.json({ tags }, { status: 201 });
}

// body: { oldName: string; newName: string } — 既存タグの名称を変更し、
// このタグが付いている全アイテムにもカスケードする。
export async function PATCH(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const b = body as { oldName?: unknown; newName?: unknown } | null;
  if (
    typeof b?.oldName !== "string" ||
    typeof b?.newName !== "string" ||
    b.newName.trim() === ""
  ) {
    return NextResponse.json(
      { error: "oldName and newName are required" },
      { status: 400 },
    );
  }

  const tags = await renameTag(userId, b.oldName, b.newName);
  return NextResponse.json({ tags });
}

// body: { name: string } — タグを削除し、付与されている全アイテムからも取り除く。
export async function DELETE(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = (body as { name?: unknown } | null)?.name;
  if (typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const tags = await deleteTag(userId, name);
  return NextResponse.json({ tags });
}
