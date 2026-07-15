import { cn } from "@/lib/cn";

export function Table({
  className,
  containerClassName,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & { containerClassName?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto", containerClassName)}>
      <table className={cn("w-full text-left text-sm", className)} {...props} />
    </div>
  );
}

export function THead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-line bg-page/60 text-[11px] font-semibold uppercase tracking-wider text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}

export function TR({
  className,
  clickable,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { clickable?: boolean }) {
  return (
    <tr
      className={cn(
        "transition-colors",
        clickable && "cursor-pointer hover:bg-rowhover focus-within:bg-rowhover",
        className,
      )}
      {...props}
    />
  );
}

export function TH({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("whitespace-nowrap px-5 py-2.5 font-semibold", className)} {...props} />
  );
}

export function TD({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("whitespace-nowrap px-5 py-3.5 text-ink", className)} {...props} />
  );
}
