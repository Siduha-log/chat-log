"use client";

import { useState, type FormEvent } from "react";
import type { Folder } from "@/lib/kv/folders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { detectAiToolFromUrl } from "@/lib/ai-tool-detect";
import { apiGet } from "@/lib/api/client";
import { DEFAULT_TAG_COLOR_ID, getTagColorSwatch, type Tag } from "@/lib/tagColors";

type MetadataResult = {
  aiTool: string;
  title: string | null;
  content: string | null;
  fetched: boolean;
};

export type ItemFormValues = {
  shareUrl: string;
  title: string;
  memo: string;
  contentText: string;
  tags: string[];
  aiTool: string;
  favorite: boolean;
  folderId: string | null;
};

const emptyValues: ItemFormValues = {
  shareUrl: "",
  title: "",
  memo: "",
  contentText: "",
  tags: [],
  aiTool: "",
  favorite: false,
  folderId: null,
};

type Props = {
  initial?: Partial<ItemFormValues>;
  folders: Folder[];
  availableTags: Tag[];
  availableAiTools: string[];
  onCancel: () => void;
  onSubmit: (values: ItemFormValues) => Promise<void>;
};

export function ItemForm({
  initial,
  folders,
  availableTags,
  availableAiTools,
  onCancel,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<ItemFormValues>({ ...emptyValues, ...initial });
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [metaNotice, setMetaNotice] = useState<string | null>(null);

  const handleUrlBlur = () => {
    if (!values.aiTool) {
      const detected = detectAiToolFromUrl(values.shareUrl);
      if (detected) setValues((v) => ({ ...v, aiTool: detected }));
    }
  };

  // iOSはWeb Share Target非対応のため、共有シートの「コピー」で
  // クリップボードに入れたURLをここで貼り付けてもらう運用の入口。
  const handlePasteUrl = async () => {
    setMetaNotice(null);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      setValues((v) => ({
        ...v,
        shareUrl: text,
        aiTool: v.aiTool || detectAiToolFromUrl(text),
      }));
    } catch {
      setMetaNotice("クリップボードの読み取りに失敗しました。共有URL欄に直接貼り付けてください。");
    }
  };

  const handleAutoFetch = async () => {
    if (!values.shareUrl.trim()) return;
    setFetchingMeta(true);
    setMetaNotice(null);
    try {
      const meta = await apiGet<MetadataResult>(
        `/api/metadata?url=${encodeURIComponent(values.shareUrl.trim())}`,
      );
      setValues((v) => ({
        ...v,
        title: meta.title ?? v.title,
        aiTool: meta.aiTool || v.aiTool,
        contentText: meta.content ?? v.contentText,
      }));
      if (!meta.fetched) {
        setMetaNotice(
          "ページの内容を取得できませんでした（JS描画のページやアクセス制限の可能性）。会話のやり取りをコピーして、タイトル・本文欄に貼り付けてください。",
        );
      } else if (!meta.content) {
        setMetaNotice(
          "※本文の自動取得に失敗しました（Gemini等では起こりうる既知の制限です）。会話のやり取りや回答のまとめをコピーして、本文欄に貼り付けてください。",
        );
      } else if (!meta.title) {
        setMetaNotice("タイトルの自動取得に失敗しました。必要に応じて手動で入力してください。");
      }
    } catch (err) {
      setMetaNotice(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setFetchingMeta(false);
    }
  };

  const toggleTag = (tag: string) => {
    setValues((v) => ({
      ...v,
      tags: v.tags.includes(tag) ? v.tags.filter((t) => t !== tag) : [...v.tags, tag],
    }));
  };

  const addCustomTag = () => {
    const t = newTag.trim();
    if (t && !values.tags.includes(t)) {
      setValues((v) => ({ ...v, tags: [...v.tags, t] }));
    }
    setNewTag("");
  };

  // availableTagsは既存の登録済みタグ一覧のみを含むため、まだ登録されていない
  // カスタムタグ(このアイテムに今追加したばかりのもの)もチップとして表示できるよう合成する。
  const availableTagNames = availableTags.map((t) => t.name);
  const tagOptions = [
    ...availableTagNames,
    ...values.tags.filter((t) => !availableTagNames.includes(t)),
  ];
  const colorForTag = (name: string) =>
    getTagColorSwatch(availableTags.find((t) => t.name === name)?.color ?? DEFAULT_TAG_COLOR_ID);

  // 同様に、まだ登録されていない自由入力中のAIツール名もボタンとして選択できるよう合成する。
  const aiToolOptions = values.aiTool && !availableAiTools.includes(values.aiTool)
    ? [...availableAiTools, values.aiTool]
    : availableAiTools;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.shareUrl.trim()) {
      setError("共有URLは必須です");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-lg border-2 border-primary p-5">
      <div className="flex flex-col gap-1">
        <Label htmlFor="shareUrl">共有URL *</Label>
        <div className="flex gap-2">
          <Input
            id="shareUrl"
            required
            value={values.shareUrl}
            onChange={(e) => setValues((v) => ({ ...v, shareUrl: e.target.value }))}
            onBlur={handleUrlBlur}
            placeholder="https://..."
          />
          <Button type="button" variant="outline" onClick={handlePasteUrl}>
            📋 貼り付け
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={fetchingMeta || !values.shareUrl.trim()}
            onClick={handleAutoFetch}
          >
            {fetchingMeta ? "取得中…（最大1分ほどかかる場合があります）" : "自動取得"}
          </Button>
        </div>
        {metaNotice && <p className="text-xs text-muted-foreground">{metaNotice}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="title">タイトル</Label>
        <Input
          id="title"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="memo">メモ</Label>
        <Textarea
          id="memo"
          value={values.memo}
          onChange={(e) => setValues((v) => ({ ...v, memo: e.target.value }))}
          placeholder="一言メモ（空欄可）"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="contentText">本文（任意）</Label>
        <Textarea
          id="contentText"
          rows={3}
          value={values.contentText}
          onChange={(e) => setValues((v) => ({ ...v, contentText: e.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label>AIツール</Label>
        <div className="flex flex-wrap gap-2">
          {aiToolOptions.map((tool) => (
            <button
              type="button"
              key={tool}
              onClick={() => setValues((v) => ({ ...v, aiTool: tool }))}
              className={`rounded-full border px-3 py-1 text-sm ${
                values.aiTool === tool ? "bg-foreground text-background" : ""
              }`}
            >
              {tool}
            </button>
          ))}
        </div>
        <Input
          className="mt-1"
          placeholder="その他（自由入力）"
          value={values.aiTool}
          onChange={(e) => setValues((v) => ({ ...v, aiTool: e.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="folderId">フォルダ</Label>
        <select
          id="folderId"
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={values.folderId ?? ""}
          onChange={(e) =>
            setValues((v) => ({ ...v, folderId: e.target.value || null }))
          }
        >
          <option value="">未分類</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label>タグ</Label>
        <div className="flex flex-wrap gap-2">
          {tagOptions.map((tag) => {
            const swatch = colorForTag(tag);
            const selected = values.tags.includes(tag);
            return (
              <button
                type="button"
                key={tag}
                onClick={() => toggleTag(tag)}
                style={{ backgroundColor: swatch.bg, color: swatch.text }}
                className={`rounded-full border border-transparent px-3 py-1 text-sm transition-opacity ${
                  selected ? "ring-2 ring-primary" : "opacity-60"
                }`}
              >
                #{tag}
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex gap-2">
          <Input
            placeholder="新しいタグを追加"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomTag();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addCustomTag}>
            追加
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setValues((v) => ({ ...v, favorite: !v.favorite }))}
        aria-pressed={values.favorite}
        className="flex w-fit items-center gap-1.5 text-sm"
      >
        <span className="text-lg leading-none text-favorite">
          {values.favorite ? "★" : "☆"}
        </span>
        お気に入り登録
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          キャンセル
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </form>
  );
}
