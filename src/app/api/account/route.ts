import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteAllItems } from "@/lib/kv/items";
import { deleteAllFolders } from "@/lib/kv/folders";
import { deleteAllTags } from "@/lib/kv/tags";

// アカウント削除。KVデータを先に消してからSupabase Authのユーザー自体を削除する。
// この順序にしているのは、Auth削除を先に行うと、その後のKV削除が失敗した場合に
// 「アカウントは消えたのにデータが残る」うえログインもできずエラーを提示する
// 手段が無くなるため。KVを先に消せば、Auth削除が失敗してもログインしたまま
// エラーメッセージを表示できる（非破壊的な失敗モードを優先）。
export async function DELETE(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await Promise.all([deleteAllItems(userId), deleteAllFolders(userId), deleteAllTags(userId)]);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json(
      { error: "アプリ内データは削除されましたが、アカウント自体の削除に失敗しました" },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
