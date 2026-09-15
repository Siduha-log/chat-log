import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { detectAiToolFromUrl } from "@/lib/ai-tool-detect";

// ページ本文はJSで描画されるSPA（ChatGPT/Claude/Gemini等の共有ページ）が多く、
// サーバー側の単純fetchでは取得できない。OGPメタタグ（title/description）は
// SNSプレビュー用にサーバー側で埋め込まれていることが多いため、これだけを狙う。
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 300 * 1024; // <head>が読めれば十分なので上限を設ける

// 既知のプライベート/ループバックIPリテラルのみを簡易ブロックする。
// DNSリバインディング（ドメイン名が後からプライベートIPを指すよう変化する攻撃）までは
// 防げないが、個人利用の単一ユーザー向けツールとして許容する既知の限界（plan.md参照）。
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "127.0.0.1") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  return false;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMeta(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

type MetadataResult = {
  aiTool: string;
  title: string | null;
  description: string | null;
  fetched: boolean;
};

export async function GET(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const targetUrl = new URL(request.url).searchParams.get("url");
  if (!targetUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "unsupported protocol" }, { status: 400 });
  }
  if (isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: "this host is not allowed" }, { status: 400 });
  }

  const aiTool = detectAiToolFromUrl(parsed.toString());
  const empty: MetadataResult = { aiTool, title: null, description: null, fetched: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AiLinkManagerBot/1.0; +metadata-fetch)",
      },
    });

    if (!res.ok || !res.body) {
      return NextResponse.json(empty);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;

    while (bytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    await reader.cancel().catch(() => {});

    const title = extractMeta(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i,
      /<title[^>]*>([^<]*)<\/title>/i,
    ]);
    const description = extractMeta(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    ]);

    return NextResponse.json({ aiTool, title, description, fetched: true } satisfies MetadataResult);
  } catch {
    return NextResponse.json(empty);
  } finally {
    clearTimeout(timeout);
  }
}
