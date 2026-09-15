import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// plan.md 4.2章: user_idはクライアントの自己申告を信用せず、Supabaseへ
// getUser()でリモート検証してから使う。4.3章: 検証結果はCache APIに
// 短時間キャッシュし、同一トークンでの連続リクエストのAuth API呼び出しを抑える。
const AUTH_CACHE_TTL_SECONDS = 60;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// `caches`（Cache API）は実際のWorkersランタイム（本番/`opennextjs-cloudflare preview`）
// でのみ存在し、素の`next dev`には存在しない。存在しない場合はキャッシュを使わず
// 毎回Auth APIを呼ぶ（plan.md 4.3章のキャッシュミス時フォールバックと同じ扱い）。
function getEdgeCache(): Cache | null {
  return typeof caches !== "undefined" ? caches.default : null;
}

export async function getVerifiedUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const cache = getEdgeCache();
  const cacheKey = cache
    ? new Request(
        `https://auth-cache.internal/verified-user/${await sha256Hex(token)}`,
      )
    : null;

  if (cache && cacheKey) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const { userId } = (await cached.json()) as { userId: string };
      return userId;
    }
  }

  const { env } = getCloudflareContext();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  if (cache && cacheKey) {
    await cache.put(
      cacheKey,
      new Response(JSON.stringify({ userId: data.user.id }), {
        headers: { "Cache-Control": `max-age=${AUTH_CACHE_TTL_SECONDS}` },
      }),
    );
  }

  return data.user.id;
}
