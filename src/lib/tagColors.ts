// タグのカラーカスタマイズ用パレット。
// 「色」は実データにはパレットのidのみを保存し、見た目（hex値）はここで一元管理する。
// こうすることで、後から色味を調整してもタグ側のデータ移行が不要になる。

export type Tag = { name: string; color: string };

export type TagColorSwatch = {
  id: string;
  bg: string;
  text: string;
  label: string;
};

// 薄く落ち着いたパステル調（背景を薄く、文字は読みやすいよう濃いめに）
export const TAG_COLOR_PALETTE: TagColorSwatch[] = [
  { id: "gray", bg: "#f3f4f6", text: "#374151", label: "グレー" },
  { id: "red", bg: "#fee2e2", text: "#991b1b", label: "レッド" },
  { id: "orange", bg: "#ffedd5", text: "#9a3412", label: "オレンジ" },
  { id: "yellow", bg: "#fef9c3", text: "#854d0e", label: "イエロー" },
  { id: "green", bg: "#dcfce7", text: "#166534", label: "グリーン" },
  { id: "teal", bg: "#ccfbf1", text: "#115e59", label: "ティール" },
  { id: "blue", bg: "#dbeafe", text: "#1e40af", label: "ブルー" },
  { id: "indigo", bg: "#e0e7ff", text: "#3730a3", label: "インディゴ" },
  { id: "purple", bg: "#f3e8ff", text: "#6b21a8", label: "パープル" },
  { id: "pink", bg: "#fce7f3", text: "#9d174d", label: "ピンク" },
];

export const DEFAULT_TAG_COLOR_ID = TAG_COLOR_PALETTE[0].id;

export function isValidTagColorId(id: string): boolean {
  return TAG_COLOR_PALETTE.some((c) => c.id === id);
}

export function getTagColorSwatch(id: string | undefined): TagColorSwatch {
  return TAG_COLOR_PALETTE.find((c) => c.id === id) ?? TAG_COLOR_PALETTE[0];
}
