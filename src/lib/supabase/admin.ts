import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// service_role keyはRLSを全てバイパスする管理者権限の秘密鍵。
// 他のSupabaseクライアント（anon key、src/lib/supabase/client.ts等）とは
// 完全に分離し、このファイル以外では扱わない。アカウント削除
// （supabase.auth.admin.deleteUser）専用。
export function createAdminClient() {
  const { env } = getCloudflareContext();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}
