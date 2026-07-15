"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";

export interface ToastState {
  message: string;
  tone: "green" | "red";
}

/** Transient, self-dismissing notification pinned to the bottom-right. */
export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-6 right-6 z-50 max-w-sm rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl",
        toast.tone === "green" ? "bg-brand" : "bg-danger",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex-1">{toast.message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="-mr-1 shrink-0 leading-none text-white/70 transition-colors hover:text-white"
        >
          ×
        </button>
      </div>
    </div>
  );
}
