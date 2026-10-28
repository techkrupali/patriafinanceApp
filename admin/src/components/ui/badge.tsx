import { cn } from "@/lib/cn";
import { label } from "@/lib/format";

type Tone = "green" | "red" | "amber" | "blue" | "gray";

const tones: Record<Tone, string> = {
  green: "bg-brand-soft text-brand ring-1 ring-inset ring-brand/15",
  red: "bg-danger/10 text-danger ring-1 ring-inset ring-danger/15",
  amber: "bg-gold-soft text-warn ring-1 ring-inset ring-gold/30",
  blue: "bg-info-soft text-info ring-1 ring-inset ring-info/15",
  gray: "bg-lavender text-muted ring-1 ring-inset ring-line",
};

export function Badge({
  tone = "gray",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5",
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
  approved: "green",
  executed: "green",
  suspended: "red",
  failed: "red",
  rejected: "red",
  pending: "amber",
  frozen: "amber",
  closed: "gray",
  expired: "gray",
  cancelled: "gray",
  // Loan statuses
  disbursed: "blue",
  repaid: "green",
  defaulted: "red",
  // Repayment statuses
  paid: "green",
  partial: "blue",
  overdue: "red",
  // Project + milestone statuses
  completed: "green",
  released: "green",
  flagged: "red",
  funded: "blue",
  submitted: "amber",
  planned: "gray",
};

/** Badge that picks its tone from a known status string. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "gray"}>{label(status)}</Badge>;
}
