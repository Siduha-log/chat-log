import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { getItem, listIndex, type LinkItem } from "@/lib/kv/items";

// 一覧のindexにはcontentSnippet（本文先頭300文字）しか無いため、本文の奥の方に
// しか出てこないキーワードはヒットしない。ここでは該当ユーザーの全アイテムを
// 個別キーから取得し、本文全文に対して一致するものだけをidで返す
// （タイトル/メモ/タグ/AIツールの一致は既にクライアント側でindexだけを見て
// 高速に処理できているため、ここでは本文全文一致だけを担当すれば十分）。
export async function GET(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase();
  if (!q) {
    return NextResponse.json({ ids: [] });
  }

  const index = await listIndex(userId);
  const items = await Promise.all(index.map((entry) => getItem(userId, entry.id)));

  const ids = items
    .filter((item): item is LinkItem => item !== null)
    .filter((item) => item.contentText.toLowerCase().includes(q))
    .map((item) => item.id);

  return NextResponse.json({ ids });
}
