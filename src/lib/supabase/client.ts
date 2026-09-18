import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // パスキー（WebAuthn）機能はSupabase Auth側でまだexperimental扱いのため
      // 明示的なオプトインが必要（plan_v0.1.md フェーズF タスク10参照）。
      auth: {
        experimental: { passkey: true },
      },
    },
  );
}
