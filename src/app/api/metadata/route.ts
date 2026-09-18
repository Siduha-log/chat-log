import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import puppeteer from "@cloudflare/puppeteer";
import { getVerifiedUserId } from "@/lib/auth/verify";
import { detectAiToolFromUrl } from "@/lib/ai-tool-detect";

// ページ本文はJSで描画されるSPA（ChatGPT/Claude/Gemini等の共有ページ）が多く、
// サーバー側の単純fetchでは取得できない。OGPメタタグ（title/description）は
// SNSプレビュー用にサーバー側で埋め込まれていることが多いため、これだけを狙う。
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 500 * 1024; // <head>が読めれば十分なので上限を設ける

// 本文（会話全文）はOGPタグには載っていないため、実際にJS描画した結果を
// 返してくれるJina Reader (https://r.jina.ai) 経由で別途取得する。
// Geminiの共有ページはJS描画が重く、短いタイムアウトだとログイン画面の
// ガワしか返らないことが実URL検証で分かったため長めに取る。
const JINA_FETCH_TIMEOUT_MS = 30000;

// Geminiの共有ページのAngularアプリのマウント先（実際のレンダリング結果を
// 検証して確認したタグ名）。このタグ自体はSSR直後の空の状態でも存在するため
// 完全な保証にはならないが、無害な改善として指定しておく。
const JINA_WAIT_FOR_SELECTOR = "chat-app-orchestrator";

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
  content: string | null;
  fetched: boolean;
};

type OgpResult = { title: string | null; fetched: boolean };

async function fetchOgpMeta(parsed: URL, aiTool: string): Promise<OgpResult> {
  const empty: OgpResult = { title: null, fetched: false };

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
      return empty;
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

    return { title, fetched: true };
  } catch {
    return empty;
  } finally {
    clearTimeout(timeout);
  }
}

type JinaResult = { content: string | null; headingTitle: string | null };

// Googleのログイン画面へのリンクURL。実URL検証で確認した最小のガワ
// （"[Sign in](https://accounts.google.com/ServiceLogin?...)"だけの数百文字）
// にも必ず含まれており、逆に本物の会話本文にこれが出ることはまず無いため、
// 文字数に関わらず常にゴミ判定に使える強いシグナル。
const RENDER_FAILURE_ALWAYS_PHRASES = ["accounts.google.com/servicelogin"];

// Geminiの共有ページがレンダリング未完了/ログイン画面のガワを返した実例
// （実URL検証で確認したもの）に共通して出現する文言。ただし単体では
// 本物の会話本文にも出現しうる語（"google apps"等）を含むため、
// 短い場合に限定して判定する。
const RENDER_FAILURE_SHORT_ONLY_PHRASES = [
  "sign in to save activity",
  "meet gemini, your personal ai assistant",
  "something went wrong",
  "link doesn't exist",
  "check your internet connection",
  "google apps",
];

// 短すぎるものは無条件でゴミとみなす（会話本文は普通これより遥かに長い）。
const MIN_VALID_CONTENT_LENGTH = 200;
// これより長い文章に上記フレーズがたまたま含まれていても、誤検知を避けるため
// ゴミ扱いはしない（本物の会話本文がこの長さを超えることは頻繁にあるため）。
const FAILURE_PHRASE_LENGTH_CEILING = 3000;

function looksLikeRenderFailure(content: string): boolean {
  if (content.length < MIN_VALID_CONTENT_LENGTH) return true;

  const lower = content.toLowerCase();
  if (RENDER_FAILURE_ALWAYS_PHRASES.some((phrase) => lower.includes(phrase))) {
    return true;
  }
  if (content.length >= FAILURE_PHRASE_LENGTH_CEILING) return false;

  return RENDER_FAILURE_SHORT_ONLY_PHRASES.some((phrase) => lower.includes(phrase));
}

const BROWSER_RENDER_TIMEOUT_MS = 15000;
const BROWSER_WAIT_FOR_SELECTOR_TIMEOUT_MS = 8000;

type BrowserResult = { content: string | null };

// Cloudflare Browser Rendering（Puppeteer）で実際にページをレンダリングし、
// 本文（会話全文）を取得する主経路。Jina Readerと違いクリーンなMarkdown変換は
// してくれないため、document.body.innerTextをそのまま本文候補として扱う
// （ナビ/フッター等のノイズが多少混ざることは許容し、Readabilityアルゴリズムまでは実装しない）。
async function fetchBrowserRenderingContent(
  targetUrl: string,
  browserBinding: CloudflareEnv["MYBROWSER"] | undefined,
  aiTool: string,
): Promise<BrowserResult> {
  const empty: BrowserResult = { content: null };
  // ローカルnext devにはBrowser Rendering bindingが存在しない
  // （caches等と同じく実際のWorkersランタイムでのみ利用可能）。
  if (!browserBinding) return empty;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch(browserBinding);
    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: BROWSER_RENDER_TIMEOUT_MS });

    if (aiTool === "Gemini") {
      // Geminiのみ既存のJina実装と同じセレクタを待つ（存在しなくてもハングしない
      // よう.catchで握りつぶす）。
      await page
        .waitForSelector(JINA_WAIT_FOR_SELECTOR, {
          timeout: BROWSER_WAIT_FOR_SELECTOR_TIMEOUT_MS,
        })
        .catch(() => {});
    }

    const text = await page.evaluate(() => document.body.innerText);
    const trimmed = text.trim();
    if (!trimmed || looksLikeRenderFailure(trimmed)) return empty;

    return { content: trimmed };
  } catch {
    return empty;
  } finally {
    await browser?.close().catch(() => {});
  }
}

function extractHeadingTitle(body: string): string | null {
  // Geminiの共有ページは本文の1行目に実際の会話タイトルが
  // 「# 見出し」として入っている（実URLで検証済み）。
  const firstLine = body.split("\n").find((line) => line.trim() !== "");
  const h1Match = firstLine?.match(/^#\s+(.+)$/);
  if (h1Match) return h1Match[1].trim();

  // Claudeの共有ページは会話タイトルがどこにも存在しない既知の限界がある
  // （実URL検証済み、plan.md参照）。次善策として、Jinaがページ構造から
  // 変換した最初の発言見出し「## You said: <発言冒頭>」を仮タイトルとして使う
  // （本物のタイトルではなく最初の発言のプレビューだが、無題よりは実用的）。
  const youSaidMatch = body.match(/^##\s+You said:\s*(.+)$/m);
  if (youSaidMatch) {
    const text = youSaidMatch[1].trim();
    return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  }

  return null;
}

// Jina Reader (https://r.jina.ai) は対象URLを実際にレンダリングしてから
// クリーンなMarkdownを返してくれるサービス。ChatGPT/Claude/GeminiのようなJS描画
// SPAの共有ページから会話本文を取得するために使う（OGPタグには本文が無いため）。
async function fetchJinaContentOnce(
  targetUrl: string,
  apiKey: string | undefined,
  aiTool: string,
): Promise<JinaResult> {
  const empty: JinaResult = { content: null, headingTitle: null };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JINA_FETCH_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "x-no-cache": "true",
      "X-Timeout": String(JINA_FETCH_TIMEOUT_MS / 1000),
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    // X-Wait-For-SelectorはGeminiのDOM構造に特化したセレクタのため、
    // 他サービスに送ると存在しないセレクタを待ち続けてX-Timeoutいっぱいまで
    // ハングすることが実URL検証で判明した（ChatGPT/Claudeが軒並みタイムアウト
    // する不具合として再現）。Geminiにだけ限定して付与する。
    if (aiTool === "Gemini") {
      headers["X-Wait-For-Selector"] = JINA_WAIT_FOR_SELECTOR;
    }

    const res = await fetch(`https://r.jina.ai/${targetUrl}`, {
      signal: controller.signal,
      headers,
    });
    if (!res.ok) return empty;

    const text = await res.text();
    const marker = "Markdown Content:";
    const idx = text.indexOf(marker);
    if (idx === -1) return empty;

    const body = text.slice(idx + marker.length).trim();
    if (!body) return empty;

    return {
      content: body,
      headingTitle: extractHeadingTitle(body),
    };
  } catch {
    return empty;
  } finally {
    clearTimeout(timeout);
  }
}

// レンダリング未完了のゴミしか返らなかった場合に限り、1回だけ再試行する。
async function fetchJinaContent(
  targetUrl: string,
  apiKey: string | undefined,
  aiTool: string,
): Promise<JinaResult> {
  const first = await fetchJinaContentOnce(targetUrl, apiKey, aiTool);
  if (first.content && !looksLikeRenderFailure(first.content)) return first;

  const second = await fetchJinaContentOnce(targetUrl, apiKey, aiTool);
  if (second.content && !looksLikeRenderFailure(second.content)) return second;

  console.warn(`[metadata] Jina Readerの本文取得に2回とも失敗（ゴミ判定）: ${targetUrl}`);
  return { content: null, headingTitle: null };
}

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
  const { env } = getCloudflareContext();

  // フェーズ1（OGP、タイトル用）とフェーズ2（Browser Rendering、本文取得の主経路）を
  // 並行実行する。フェーズ2が失敗/ゴミ判定された場合のみ、フェーズ3（Jina Reader）を
  // 追加で順次実行する（通常時はJinaの追加レイテンシが発生しない設計）。
  const [ogp, browserResult] = await Promise.all([
    fetchOgpMeta(parsed, aiTool),
    fetchBrowserRenderingContent(parsed.toString(), env.MYBROWSER, aiTool),
  ]);

  let content = browserResult.content;
  let fallbackHeadingTitle: string | null = null;
  if (!content) {
    const jina = await fetchJinaContent(parsed.toString(), env.JINA_API_KEY, aiTool);
    content = jina.content;
    fallbackHeadingTitle = jina.headingTitle;
  }

  const title = ogp.title || fallbackHeadingTitle || null;

  return NextResponse.json({
    aiTool,
    title,
    content,
    fetched: ogp.fetched || content !== null,
  } satisfies MetadataResult);
}
