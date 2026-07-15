"use client";

import { Button } from "@/components/ui/button";

/**
 * Overlay + card shell for admin action forms. Mirrors ConfirmDialog's
 * look (navy scrim, white rounded card, shadow) but wraps a real `<form>`
 * so Enter submits and the footer owns the busy/disabled state. Parents
 * mount it conditionally, so every open starts from fresh state.
 */
export function FormModal({
  title,
  description,
  error,
  busy,
  submitLabel,
  submitVariant = "primary",
  submitDisabled = false,
  onSubmit,
  onClose,
  children,
  ariaLabel,
}: {
  title: string;
  description?: string;
  error?: string | null;
  busy: boolean;
  submitLabel: string;
  submitVariant?: "primary" | "danger";
  submitDisabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      onClick={busy ? undefined : onClose}
    >
      <form
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !submitDisabled) onSubmit();
        }}
      >
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}

        <div className="mt-4 space-y-4">{children}</div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant={submitVariant}
            size="sm"
            type="submit"
            disabled={busy || submitDisabled}
          >
            {busy ? "Working..." : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Labelled field wrapper for use inside a FormModal. */
export function ModalField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
