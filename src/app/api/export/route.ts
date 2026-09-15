import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { exportAllItems } from "@/lib/kv/items";

// plan.md 5.4章 方式(A): エクスポート時のみ全アイテムを個別キーから取得する。
export async function GET(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const items = await exportAllItems(userId);
  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), items },
    null,
    2,
  );

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="ai-link-manager-export.json"',
    },
  });
}
