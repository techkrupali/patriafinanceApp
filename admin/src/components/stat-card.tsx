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
    <Card className="px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-bold",
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
      <Skeleton className="mt-3 h-7 w-32" />
    </Card>
  );
}
