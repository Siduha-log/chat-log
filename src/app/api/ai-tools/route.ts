import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { deleteAiTool, ensureAiToolsRegistered, listAiTools, renameAiTool } from "@/lib/kv/aiTools";

export async function GET(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const aiTools = await listAiTools(userId);
  return NextResponse.json({ aiTools });
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

  await ensureAiToolsRegistered(userId, [name]);
  const aiTools = await listAiTools(userId);
  return NextResponse.json({ aiTools }, { status: 201 });
}

// body: { oldName: string; newName: string } — 既存AIツール名を変更し、
// このAIツールが設定されている全アイテムにもカスケードする。
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

  const aiTools = await renameAiTool(userId, b.oldName, b.newName);
  return NextResponse.json({ aiTools });
}

// body: { name: string } — AIツールを選択肢一覧から削除する
// （既存アイテムのaiTool値そのものは変更しない。src/lib/kv/aiTools.ts参照）。
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

  const aiTools = await deleteAiTool(userId, name);
  return NextResponse.json({ aiTools });
}
