import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 共有元アプリによってはURLをurlパラメータに入れず、textの自由文中に
// 埋め込んでくることがあるため、無ければtextから最初のURLを拾う。
function extractUrl(text: string | null): string | null {
  if (!text) return null;
  return text.match(/https?:\/\/\S+/)?.[0] ?? null;
}

// Android Web Share Target (manifest.tsのshare_target) の受け口。
// 共有されたURLを新規登録フォームへ引き継ぐため、ここでは保存せず
// /?shareUrl=... へリダイレクトするだけにする（無条件保存は唐突なため）。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const sharedUrl = searchParams.get("url") || extractUrl(searchParams.get("text"));
  const target = sharedUrl ? `/?shareUrl=${encodeURIComponent(sharedUrl)}` : "/";

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(target)}`);
  }
  return NextResponse.redirect(`${origin}${target}`);
}
