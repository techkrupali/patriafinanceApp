import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-sm hover:bg-brand-dark active:bg-brand-dark focus-visible:ring-brand/35 disabled:bg-brand/50 disabled:shadow-none",
  outline:
    "border border-line bg-white text-ink hover:bg-rowhover hover:border-lavender active:bg-lavender/40 focus-visible:ring-brand/25",
  ghost: "text-ink hover:bg-rowhover active:bg-lavender/40 focus-visible:ring-brand/25",
  danger:
    "bg-danger text-white shadow-sm hover:bg-danger/90 active:bg-danger focus-visible:ring-danger/35 disabled:bg-danger/50 disabled:shadow-none",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-white",
        "disabled:cursor-not-allowed disabled:opacity-70",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
