// AIツールのカラーカスタマイズ用パレット。タグ用パレット（tagColors.ts）と同様、
// 実データにはパレットのidのみを保存し、見た目（hex値）はここで一元管理する。

export type AiTool = { name: string; color: string };

export type AiToolColorSwatch = {
  id: string;
  bg: string;
  text: string;
  label: string;
};

// 鮮やか・発色の良いカラーパレット（背景は濃いめ、文字は白で視認性を確保）
export const AI_TOOL_COLOR_PALETTE: AiToolColorSwatch[] = [
  { id: "gray", bg: "#4b5563", text: "#ffffff", label: "グレー" },
  { id: "red", bg: "#dc2626", text: "#ffffff", label: "レッド" },
  { id: "orange", bg: "#ea580c", text: "#ffffff", label: "オレンジ" },
  { id: "amber", bg: "#d97706", text: "#ffffff", label: "アンバー" },
  { id: "green", bg: "#16a34a", text: "#ffffff", label: "グリーン" },
  { id: "teal", bg: "#0d9488", text: "#ffffff", label: "ティール" },
  { id: "blue", bg: "#2563eb", text: "#ffffff", label: "ブルー" },
  { id: "indigo", bg: "#4f46e5", text: "#ffffff", label: "インディゴ" },
  { id: "purple", bg: "#9333ea", text: "#ffffff", label: "パープル" },
  { id: "pink", bg: "#db2777", text: "#ffffff", label: "ピンク" },
];

export const DEFAULT_AI_TOOL_COLOR_ID = AI_TOOL_COLOR_PALETTE[0].id;

export function isValidAiToolColorId(id: string): boolean {
  return AI_TOOL_COLOR_PALETTE.some((c) => c.id === id);
}

export function getAiToolColorSwatch(id: string | undefined): AiToolColorSwatch {
  return AI_TOOL_COLOR_PALETTE.find((c) => c.id === id) ?? AI_TOOL_COLOR_PALETTE[0];
}
