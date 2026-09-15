import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { createFolder, listFolders } from "@/lib/kv/folders";
import { FOLDER_NAME_MAX_LENGTH } from "@/lib/constants";

export async function GET(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const folders = await listFolders(userId);
  return NextResponse.json({ folders });
}

export async function POST(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).name !== "string" ||
    (body as Record<string, unknown>).name === ""
  ) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  if ((b.name as string).length > FOLDER_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { error: `name must be ${FOLDER_NAME_MAX_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }
  const parentId = typeof b.parentId === "string" ? b.parentId : null;

  const folder = await createFolder(userId, { name: b.name as string, parentId });
  if (!folder) {
    return NextResponse.json(
      { error: "parentId does not exist" },
      { status: 400 },
    );
  }

  return NextResponse.json({ folder }, { status: 201 });
}
