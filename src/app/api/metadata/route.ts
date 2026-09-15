import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { detectAiToolFromUrl } from "@/lib/ai-tool-detect";

// ページ本文はJSで描画されるSPA（ChatGPT/Claude/Gemini等の共有ページ）が多く、
// サーバー側の単純fetchでは取得できない。OGPメタタグ（title/description）は
// SNSプレビュー用にサーバー側で埋め込まれていることが多いため、これだけを狙う。
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 500 * 1024; // <head>が読めれば十分なので上限を設ける

// Botを名乗るUser-Agentだと、Bot対策のあるサイトからOGPタグを含まない
// 簡易ページ/ブロック応答を返される場合があるため、一般的なブラウザを装う。
// （個人利用ツールが自分自身の要求したURL1件だけを都度取得するものであり、
//  クロールや大量アクセスは行わないため許容する）
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function getAttr(tag: string, attrName: string): string | null {
  const re = new RegExp(`${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const m = tag.match(re);
  const value = m?.[1] ?? m?.[2];
  return value !== undefined ? decodeEntities(value.trim()) : null;
}

// <meta>タグを個別に切り出してから属性を読むことで、
// property/name と content の記述順序に依存せず正しく取得できるようにする。
function collectMetaTags(html: string): { key: string; content: string }[] {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const results: { key: string; content: string }[] = [];
  for (const tag of tags) {
    const content = getAttr(tag, "content");
    if (content === null || content === "") continue;
    const key = getAttr(tag, "property") ?? getAttr(tag, "name");
    if (key) results.push({ key: key.toLowerCase(), content });
  }
  return results;
}

function pickFirst(
  metas: { key: string; content: string }[],
  keys: string[],
): string | null {
  for (const key of keys) {
    const found = metas.find((m) => m.key === key);
    if (found) return found.content;
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
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en;q=0.8",
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

    const metas = collectMetaTags(html);

    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const titleTag = titleTagMatch
      ? decodeEntities(titleTagMatch[1].replace(/\s+/g, " ").trim())
      : null;

    // ChatGPTの共有ページはog:title/twitter:titleが「このチャットを見てみる」等の
    // 汎用的な招待文言で固定されており、実際の会話タイトルは<title>タグにしか
    // 入っていない（実URLで検証済み）。そのためChatGPTだけ<title>を優先する。
    const ogTitle = pickFirst(metas, ["og:title", "twitter:title"]);
    const title = (aiTool === "ChatGPT" ? titleTag || ogTitle : ogTitle || titleTag) || null;

    const description =
      pickFirst(metas, ["og:description", "twitter:description", "description"]) || null;

    return NextResponse.json({ aiTool, title, description, fetched: true } satisfies MetadataResult);
  } catch {
    return NextResponse.json(empty);
  } finally {
    clearTimeout(timeout);
  }
}
