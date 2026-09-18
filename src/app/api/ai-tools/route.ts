import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import {
  deleteAiTool,
  ensureAiToolsRegistered,
  listAiTools,
  renameAiTool,
  setAiToolColor,
} from "@/lib/kv/aiTools";
import { isValidAiToolColorId } from "@/lib/aiToolColors";
import { AI_TOOL_NAME_MAX_LENGTH } from "@/lib/constants";

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
  if (name.length > AI_TOOL_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { error: `name must be ${AI_TOOL_NAME_MAX_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  await ensureAiToolsRegistered(userId, [name]);
  const aiTools = await listAiTools(userId);
  return NextResponse.json({ aiTools }, { status: 201 });
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
  if (typeof b.newName === "string" && b.newName.length > AI_TOOL_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { error: `newName must be ${AI_TOOL_NAME_MAX_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }
  if (b.color !== undefined && (typeof b.color !== "string" || !isValidAiToolColorId(b.color))) {
    return NextResponse.json({ error: "color is invalid" }, { status: 400 });
  }

  let aiTools =
    typeof b.newName === "string" ? await renameAiTool(userId, b.oldName, b.newName) : null;
  if (typeof b.color === "string") {
    const targetName = typeof b.newName === "string" ? b.newName : b.oldName;
    aiTools = await setAiToolColor(userId, targetName, b.color);
  }

  return NextResponse.json({ aiTools: aiTools ?? (await listAiTools(userId)) });
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
