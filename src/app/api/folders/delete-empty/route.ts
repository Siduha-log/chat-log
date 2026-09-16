import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { deleteEmptyFolders } from "@/lib/kv/folders";

export async function DELETE(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const deletedIds = await deleteEmptyFolders(userId);
  return NextResponse.json({ deletedIds });
}
