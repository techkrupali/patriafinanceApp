"use client";

import { Button } from "@/components/ui/button";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import type { Pagination as PaginationMeta } from "@/lib/types";

export function Pagination({
  meta,
  onPage,
}: {
  meta: PaginationMeta;
  onPage: (page: number) => void;
}) {
  if (meta.total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
      <p className="text-xs text-muted">
        Page <span className="font-semibold text-ink">{meta.page}</span> of{" "}
        <span className="font-semibold text-ink">{meta.last_page}</span>
        <span className="ml-2">({meta.total.toLocaleString()} total)</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          <IconChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page >= meta.last_page}
          onClick={() => onPage(meta.page + 1)}
        >
          Next
          <IconChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
