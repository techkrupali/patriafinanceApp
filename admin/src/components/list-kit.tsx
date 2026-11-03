"use client";

import { cn } from "@/lib/cn";
import { formatDate, naira } from "@/lib/format";
import { IconSearch } from "@/components/icons";

/**
 * The pieces the admin list pages share (Users, KYC, Emergency, Support):
 * the page title, the emerald hero card, the small figure tiles, the status
 * tabs with counts, the filter chips and the rounded search.
 */

export type IconT = (props: { className?: string }) => React.ReactNode;

export function PageTitle({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>
        <h1 className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-[32px]">
          {title}
          <span className="text-gold">.</span>
        </h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

/** The dark emerald card that leads each page: one big figure (a count, or naira with `money`) and what's behind it. */
export function HeroCard({ icon: Icon, title, sub, value, unit, money, children }: { icon: IconT; title: string; sub: string; value?: string; unit?: string; money?: number; children?: React.ReactNode }) {
  const [whole, kobo] = money !== undefined ? naira(money).replace("₦", "").split(".") : [];
  return (
    <div
      className="relative overflow-hidden rounded-[22px] p-6 text-white shadow-[0_24px_60px_-30px_rgba(8,57,47,0.7)] sm:col-span-2 lg:col-span-2"
      style={{ background: "linear-gradient(140deg, #08392F 0%, #0B5D4B 60%, #12775F 100%)" }}
    >
      <svg viewBox="0 0 400 400" className="pointer-events-none absolute -right-28 -top-32 h-80 w-80 opacity-60" aria-hidden="true">
        <circle cx="200" cy="200" r="150" fill="none" stroke="rgba(243,247,244,0.10)" strokeWidth="30" />
        <circle cx="200" cy="262" r="92" fill="none" stroke="#5FD3A5" strokeOpacity="0.35" strokeWidth="26" strokeDasharray="420 160" strokeLinecap="round" />
      </svg>
      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
          <Icon className="h-5 w-5 text-[#5FD3A5]" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold">{title}</p>
          <p className="text-xs text-white/65">{sub}</p>
        </div>
      </div>
      {money !== undefined ? (
        <p className="relative mt-5 flex items-baseline gap-1 font-extrabold tracking-tight">
          <span className="text-xl text-white/55">₦</span>
          <span className="text-[34px] leading-none tabular-nums sm:text-[38px]">{whole}</span>
          <span className="text-lg text-white/55 tabular-nums">.{kobo}</span>
        </p>
      ) : (
        <p className="relative mt-5 flex items-baseline gap-2 font-extrabold tracking-tight">
          <span className="text-[40px] leading-none tabular-nums">{value}</span>
          {unit ? <span className="text-base font-semibold text-white/60">{unit}</span> : null}
        </p>
      )}
      {children ? <div className="relative mt-5">{children}</div> : null}
    </div>
  );
}

/** A thin bar split into parts, with a legend: on the dark hero card. */
export function SplitBar({ parts, empty }: { parts: { key: string; label: string; value: number; color: string; hint?: string }[]; empty: string }) {
  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((a, p) => a + p.value, 0);
  if (!total) return <p className="text-xs text-white/60">{empty}</p>;
  return (
    <>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10">
        {shown.map((p) => (
          <div key={p.key} title={`${p.label} · ${p.value.toLocaleString()}`} className="border-r border-[#0B5D4B]/60 last:border-0" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {shown.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5 text-xs text-white/75">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.label} <span className="font-semibold tabular-nums text-white">{p.hint ?? p.value.toLocaleString()}</span>
          </span>
        ))}
      </div>
    </>
  );
}

export type Tone = "brand" | "gold" | "muted" | "danger" | "info";
const TONES: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  gold: "bg-gold-soft text-warn",
  muted: "bg-page text-muted",
  danger: "bg-danger/10 text-danger",
  info: "bg-info-soft text-info",
};

/** A small figure tile beside the hero. */
export function KpiTile({ icon: Icon, label, value, hint, tone }: { icon: IconT; label: string; value: string; hint: string; tone: Tone }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-line/80 bg-white p-3.5 shadow-card sm:rounded-[22px] sm:p-5">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl", TONES[tone])}>
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </span>
      <span className="min-h-3 flex-1" aria-hidden="true" />
      <p className="mt-3 text-xl font-extrabold leading-none tracking-tight tabular-nums text-ink sm:mt-4 sm:text-[28px]">{value}</p>
      <p className="mt-1.5 text-xs font-semibold leading-tight text-ink sm:text-sm">{label}</p>
      <p className="hidden text-xs text-muted sm:block">{hint}</p>
    </div>
  );
}

/** Status tabs in a pill, each with its count. */
export function StatusTabs<T extends string>({ tabs, value, onChange, label }: { tabs: { value: T; label: string; count?: number; alert?: boolean }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-page p-1" role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const on = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors", on ? "bg-navy text-white shadow-sm" : "text-muted hover:text-ink")}
          >
            {t.label}
            {t.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                  on ? "bg-white/15 text-white" : t.alert && t.count > 0 ? "bg-gold text-navy" : "bg-white text-muted",
                )}
              >
                {t.count.toLocaleString()}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** A filter chip with an optional icon or dot and a count. */
export function FilterChip({ active, onClick, label, count, icon, dot }: { active: boolean; onClick: () => void; label: string; count?: number; icon?: React.ReactNode; dot?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all",
        active ? "border-navy bg-navy text-white shadow-sm" : "border-line bg-white text-ink hover:border-brand/40 hover:bg-rowhover",
      )}
    >
      {icon ? (
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", active ? "bg-white/15 text-[#5FD3A5]" : "")} style={active ? undefined : { color: dot }}>
          {icon}
        </span>
      ) : dot ? (
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      ) : null}
      {label}
      {count !== undefined ? (
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums", active ? "bg-white/15 text-white" : "bg-page text-muted")}>{count.toLocaleString()}</span>
      ) : null}
    </button>
  );
}

export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative min-w-56 flex-1">
      <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        className="h-10 w-full rounded-full border border-line bg-page pl-10 pr-4 text-sm text-ink transition-colors placeholder:text-muted/70 focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/10"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </div>
  );
}

export function initials(name?: string | null): string {
  return (
    (name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

const AVATAR_TINTS = [
  "bg-brand-soft text-brand",
  "bg-gold-soft text-warn",
  "bg-info-soft text-info",
  "bg-[#F3EEFB] text-[#6B4BB0]",
  "bg-[#E6F7EF] text-[#14725C]",
  "bg-[#FDF1E2] text-[#B5651D]",
];

/** Round initials; the tint follows the person's id (or name) so they keep their colour on every row. */
export function Avatar({ name, seed, size = "md" }: { name?: string | null; seed?: number; size?: "sm" | "md" }) {
  const key = seed ?? [...(name ?? "")].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
  const tint = AVATAR_TINTS[Math.abs(key) % AVATAR_TINTS.length];
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full font-bold", tint, size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-xs")}>
      {initials(name)}
    </span>
  );
}

/** A status word with its coloured dot. */
export function StatusDot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-ink">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      {children}
    </span>
  );
}

/** How long ago, short: "just now", "12m", "5h", "3d"; past a month the date. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 31) return `${d}d`;
  return formatDate(iso);
}

/** "5h ago", "3d ago", "just now", or the date past a month. */
export function agoText(iso: string | null | undefined): string {
  const a = ago(iso);
  return /^\d+[mhd]$/.test(a) ? `${a} ago` : a;
}

/** Time left: "in 5h", "in 2d", "in 20m"; "passed" once gone. */
export function until(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const m = Math.floor((t - Date.now()) / 60000);
  if (m < 0) return "passed";
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `in ${h}h` : `in ${Math.floor(h / 24)}d`;
}

/** Yeses as filled dots: ●●○ 2 of 3 said yes. */
export function Yeses({ got, need, word = "said yes" }: { got: number; need: number; word?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-muted">
      <span className="flex gap-0.5">
        {Array.from({ length: Math.min(need, 6) }).map((_, i) => (
          <span key={i} className={cn("h-2 w-2 rounded-full", i < got ? "bg-brand" : "bg-line")} />
        ))}
      </span>
      {got} of {need} {word}
    </span>
  );
}

/** A thin progress bar with a % beside it. */
export function Progress({ pct, tone = "bg-brand", className }: { pct: number; tone?: string; className?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-page">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${p ? Math.max(p, 3) : 0}%` }} />
      </div>
      <span className="w-8 text-right text-[11px] font-semibold tabular-nums text-muted">{p}%</span>
    </div>
  );
}

/** Hours since, for "waiting" colours. */
export function hoursSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : (Date.now() - t) / 3_600_000;
}

/** A tier's own word past "Tier N": "Tier 4 · Business" → "Business"; "Tier 2" → "". */
export function tierExtra(name: string | null | undefined): string {
  return (name ?? "").replace(/^tier\s*\d+\s*[·:-]?\s*/i, "").trim();
}

/** The list panel: filters on top, the rows below. */
export const PANEL = "mt-5 overflow-hidden rounded-[22px] border border-line/80 bg-white shadow-card";

/** by_tier style maps that may arrive as an array (keys 0..n) or an object. */
export function countsOf(v: Record<string, number> | number[] | undefined): [number, number][] {
  if (!v) return [];
  return Object.entries(v)
    .map(([k, n]) => [Number(k), Number(n)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}
