// URLのホスト名からAIツール名を判定する。クライアント（フォームの即時判定）と
// サーバー（/api/metadata）の両方から参照する純粋関数。
const AI_TOOL_DOMAINS: Record<string, string> = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "claude.ai": "Claude",
  "gemini.google.com": "Gemini",
  "chat.deepseek.com": "DeepSeek",
  "perplexity.ai": "Perplexity",
};

export function detectAiToolFromUrl(rawUrl: string): string {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
    return AI_TOOL_DOMAINS[host] ?? "";
  } catch {
    return "";
  }
}
