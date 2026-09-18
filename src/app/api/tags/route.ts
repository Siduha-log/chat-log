import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { addTag, deleteTag, listTags, renameTag, setTagColor } from "@/lib/kv/tags";
import { isValidTagColorId } from "@/lib/tagColors";
import { TAG_NAME_MAX_LENGTH } from "@/lib/constants";

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
  const b = body as { name?: unknown; color?: unknown } | null;
  if (typeof b?.name !== "string" || b.name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (b.name.length > TAG_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { error: `name must be ${TAG_NAME_MAX_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }
  if (b.color !== undefined && (typeof b.color !== "string" || !isValidTagColorId(b.color))) {
    return NextResponse.json({ error: "color is invalid" }, { status: 400 });
  }

  const tags = await addTag(userId, b.name, b.color);
  return NextResponse.json({ tags }, { status: 201 });
}

// body: { oldName: string; newName?: string; color?: string }
// newNameがあれば改名（付与済みアイテムにもカスケード）、colorがあれば色を変更する。
export async function PATCH(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const b = body as { oldName?: unknown; newName?: unknown; color?: unknown } | null;
  if (typeof b?.oldName !== "string") {
    return NextResponse.json({ error: "oldName is required" }, { status: 400 });
  }
  if (b.newName === undefined && b.color === undefined) {
    return NextResponse.json(
      { error: "newName or color is required" },
      { status: 400 },
    );
  }
  if (b.newName !== undefined && (typeof b.newName !== "string" || b.newName.trim() === "")) {
    return NextResponse.json({ error: "newName must be a non-empty string" }, { status: 400 });
  }
  if (typeof b.newName === "string" && b.newName.length > TAG_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { error: `newName must be ${TAG_NAME_MAX_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }
  if (b.color !== undefined && (typeof b.color !== "string" || !isValidTagColorId(b.color))) {
    return NextResponse.json({ error: "color is invalid" }, { status: 400 });
  }

  let tags = typeof b.newName === "string" ? await renameTag(userId, b.oldName, b.newName) : null;
  if (typeof b.color === "string") {
    const targetName = typeof b.newName === "string" ? b.newName : b.oldName;
    tags = await setTagColor(userId, targetName, b.color);
  }

  return NextResponse.json({ tags: tags ?? (await listTags(userId)) });
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
