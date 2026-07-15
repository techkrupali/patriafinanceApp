import { cn } from "@/lib/cn";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-[0_1px_1px_rgba(11,28,48,0.03)] transition-colors",
        "placeholder:text-muted/70 hover:border-lavender focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
        className,
      )}
      {...props}
    />
  );
}
