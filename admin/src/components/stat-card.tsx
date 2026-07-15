import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  hint,
  accent = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "ink" | "green" | "red" | "amber";
}) {
  return (
    <Card className="px-5 py-4 transition-shadow duration-200 hover:shadow-card-hover">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            accent === "ink" && "bg-slate-300",
            accent === "green" && "bg-brand",
            accent === "red" && "bg-danger",
            accent === "amber" && "bg-amber-500",
          )}
          aria-hidden="true"
        />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-bold tracking-tight tabular-nums",
          accent === "ink" && "text-ink",
          accent === "green" && "text-brand",
          accent === "red" && "text-danger",
          accent === "amber" && "text-amber-600",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card className="px-5 py-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3.5 h-7 w-32" />
    </Card>
  );
}
