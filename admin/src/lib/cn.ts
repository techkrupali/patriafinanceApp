/** Tiny classnames joiner (shadcn-style `cn` without deps). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
