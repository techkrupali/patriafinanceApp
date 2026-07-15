import { cn } from "@/lib/cn";

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 cursor-pointer rounded-lg border border-line bg-white px-3 pr-8 text-sm text-ink shadow-[0_1px_1px_rgba(11,28,48,0.03)] transition-colors",
        "hover:border-lavender focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
