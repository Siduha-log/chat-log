import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { reorderFolders } from "@/lib/kv/folders";

export async function PATCH(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const orderedIds = (body as { orderedIds?: unknown } | null)?.orderedIds;

  if (
    !Array.isArray(orderedIds) ||
    !orderedIds.every((id) => typeof id === "string")
  ) {
    return NextResponse.json({ error: "orderedIds must be a string array" }, {
      status: 400,
    });
  }

  const result = await reorderFolders(userId, orderedIds);
  if (result === "mismatch") {
    return NextResponse.json(
      { error: "orderedIds must exactly match existing folder ids" },
      { status: 400 },
    );
  }

  return NextResponse.json({ folders: result });
}
