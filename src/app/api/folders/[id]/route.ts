import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { deleteFolder, updateFolder, type FolderPatch } from "@/lib/kv/folders";
import { FOLDER_NAME_MAX_LENGTH } from "@/lib/constants";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const patch: FolderPatch = {};
  if (typeof b.name === "string") {
    if (b.name.length > FOLDER_NAME_MAX_LENGTH) {
      return NextResponse.json(
        { error: `name must be ${FOLDER_NAME_MAX_LENGTH} characters or fewer` },
        { status: 400 },
      );
    }
    patch.name = b.name;
  }
  if ("parentId" in b) {
    if (b.parentId === null || typeof b.parentId === "string") {
      patch.parentId = b.parentId;
    } else {
      return NextResponse.json({ error: "invalid parentId" }, { status: 400 });
    }
  }

  const result = await updateFolder(userId, id, patch);

  if (result === null) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (result === "invalid_parent") {
    return NextResponse.json(
      { error: "parentId does not exist" },
      { status: 400 },
    );
  }
  if (result === "cycle") {
    return NextResponse.json(
      { error: "cannot move a folder under its own descendant" },
      { status: 400 },
    );
  }

  return NextResponse.json({ folder: result });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await deleteFolder(userId, id);

  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return new NextResponse(null, { status: 204 });
}
