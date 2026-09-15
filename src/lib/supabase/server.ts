import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Auth専用クライアント。DB操作はしない（データ層はCloudflare KV / plan.md 5章参照）。
export async function createClient() {
  const cookieStore = await cookies();
  const { env } = getCloudflareContext();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Componentから呼ばれた場合はCookie書き込み不可。
            // middleware側でセッション更新するため無視してよい。
          }
        },
      },
    },
  );
}
