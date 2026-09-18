"use client";

import { Button } from "@/components/ui/button";

type Props = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

// 現在ページの前後何ページまでを番号ボタンとして表示するか
const SIBLING_COUNT = 1;

type PageToken = number | "ellipsis-start" | "ellipsis-end";

function getPageTokens(currentPage: number, totalPages: number): PageToken[] {
  // 先頭・末尾・現在ページ周辺・省略記号2つ分の余裕を見て、
  // これに収まるページ数なら省略せず全番号を表示する
  const maxVisible = SIBLING_COUNT * 2 + 5;
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(currentPage - SIBLING_COUNT, 1);
  const rightSibling = Math.min(currentPage + SIBLING_COUNT, totalPages);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < totalPages - 1;

  const tokens: PageToken[] = [1];

  if (showLeftEllipsis) {
    tokens.push("ellipsis-start");
  } else {
    for (let p = 2; p < leftSibling; p++) tokens.push(p);
  }

  for (let p = leftSibling; p <= rightSibling; p++) {
    if (p !== 1 && p !== totalPages) tokens.push(p);
  }

  if (showRightEllipsis) {
    tokens.push("ellipsis-end");
  } else {
    for (let p = rightSibling + 1; p < totalPages; p++) tokens.push(p);
  }

  tokens.push(totalPages);
  return tokens;
}

export function Pagination({ currentPage, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  const tokens = getPageTokens(currentPage, totalPages);

  return (
    <nav className="flex flex-wrap items-center justify-center gap-1" aria-label="ページネーション">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        前へ
      </Button>
      {tokens.map((token) =>
        typeof token === "number" ? (
          <Button
            key={token}
            type="button"
            variant={token === currentPage ? "default" : "outline"}
            size="sm"
            className="min-w-8"
            aria-current={token === currentPage ? "page" : undefined}
            onClick={() => onPageChange(token)}
          >
            {token}
          </Button>
        ) : (
          <span
            key={token}
            aria-hidden="true"
            className="flex min-w-8 items-center justify-center text-sm text-muted-foreground"
          >
            …
          </span>
        ),
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        次へ
      </Button>
    </nav>
  );
}
