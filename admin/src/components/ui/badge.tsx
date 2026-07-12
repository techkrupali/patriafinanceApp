import { cn } from "@/lib/cn";
import { label } from "@/lib/format";

type Tone = "green" | "red" | "amber" | "blue" | "gray";

const tones: Record<Tone, string> = {
  green: "bg-mint/20 text-brand",
  red: "bg-danger/10 text-danger",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-lavender/60 text-navy",
  gray: "bg-slate-100 text-muted",
};

export function Badge({
  tone = "gray",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

const STATUS_TONES: Record<string, Tone> = {
  active: "green",
  successful: "green",
  suspended: "red",
  failed: "red",
  pending: "amber",
  frozen: "amber",
  closed: "gray",
};

/** Badge that picks its tone from a known status string. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "gray"}>{label(status)}</Badge>;
}
