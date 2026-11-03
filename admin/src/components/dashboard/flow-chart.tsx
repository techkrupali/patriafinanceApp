"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { naira } from "@/lib/format";
import type { FlowPoint } from "@/lib/types";

/** ₦4.7M · ₦850k · ₦900 */
export function compactNaira(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `₦${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (a >= 1_000) return `₦${Math.round(n / 1_000)}k`;
  return `₦${Math.round(n)}`;
}

/** A smooth line through the points (monotone-ish Catmull-Rom → Bézier). */
function smooth(points: [number, number][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.18;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    // Keep the curve from dipping below the floor between two zero points.
    const floor = Math.max(p1[1], p2[1]);
    d += ` C${c1x},${Math.min(c1y, floor)} ${c2x},${Math.min(c2y, floor)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Rounded "nice" top for the y axis. */
function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (steps.find((s) => s * p >= v) ?? 10) * p;
}

const H = 260;
const PAD = { top: 16, right: 12, bottom: 30, left: 56 };

/**
 * Cash flow: money in (emerald) and money out (gold) as soft areas, with a
 * hover line and a card for the month or day under the cursor.
 */
export function FlowChart({ data }: { data: FlowPoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { inPath, outPath, inArea, outArea, xs, yIn, yOut, ticks } = useMemo(() => {
    const vals = data.flatMap((d) => [Number(d.in), Number(d.out)]);
    const top = niceMax(Math.max(...vals, 0));
    const w = width - PAD.left - PAD.right;
    const h = H - PAD.top - PAD.bottom;
    const step = data.length > 1 ? w / (data.length - 1) : 0;
    const xs = data.map((_, i) => PAD.left + i * step);
    const y = (v: number) => PAD.top + h - (v / top) * h;
    const yIn = data.map((d) => y(Number(d.in)));
    const yOut = data.map((d) => y(Number(d.out)));
    const base = PAD.top + h;
    const line = (ys: number[]) => smooth(xs.map((x, i) => [x, ys[i]] as [number, number]));
    const area = (ys: number[]) => `${line(ys)} L${xs[xs.length - 1]},${base} L${xs[0]},${base} Z`;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: top * f, y: y(top * f) }));
    return { inPath: line(yIn), outPath: line(yOut), inArea: area(yIn), outArea: area(yOut), xs, yIn, yOut, ticks };
  }, [data, width]);

  // Thin the x labels so they never crowd ("1 Nov … 30 Nov").
  const every = Math.max(1, Math.ceil(data.length / Math.max(4, Math.floor(width / 70))));
  const point = hover !== null ? data[hover] : null;
  const tipLeft = hover !== null ? Math.min(Math.max(xs[hover] + 14, PAD.left), width - 196) : 0;

  return (
    <div ref={box} className="relative w-full select-none">
      <svg
        width={width}
        height={H}
        role="img"
        aria-label="Money in and money out over time"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = e.clientX - r.left;
          let best = 0;
          xs.forEach((px, i) => {
            if (Math.abs(px - x) < Math.abs(xs[best] - x)) best = i;
          });
          setHover(best);
        }}
      >
        <defs>
          <linearGradient id="flow-in" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0B5D4B" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#0B5D4B" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="flow-out" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F2A93B" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#F2A93B" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t.v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={t.y} y2={t.y} stroke="#D3E3DA" strokeDasharray="4 6" />
            <text x={PAD.left - 10} y={t.y + 4} textAnchor="end" className="fill-muted text-[11px]">
              {compactNaira(t.v)}
            </text>
          </g>
        ))}

        <path d={outArea} fill="url(#flow-out)" />
        <path d={inArea} fill="url(#flow-in)" />
        <path d={outPath} fill="none" stroke="#F2A93B" strokeWidth={2.25} strokeLinecap="round" />
        <path d={inPath} fill="none" stroke="#0B5D4B" strokeWidth={2.5} strokeLinecap="round" />

        {data.map((d, i) =>
          i % every === 0 || i === data.length - 1 ? (
            <text key={d.key} x={xs[i]} y={H - 8} textAnchor="middle" className={hover === i ? "fill-ink text-[11px] font-semibold" : "fill-muted text-[11px]"}>
              {d.label}
            </text>
          ) : null,
        )}

        {hover !== null ? (
          <g>
            <line x1={xs[hover]} x2={xs[hover]} y1={PAD.top} y2={H - PAD.bottom} stroke="#6F8A7E" strokeDasharray="3 4" />
            <circle cx={xs[hover]} cy={yOut[hover]} r={5} fill="#fff" stroke="#F2A93B" strokeWidth={2.5} />
            <circle cx={xs[hover]} cy={yIn[hover]} r={5} fill="#fff" stroke="#0B5D4B" strokeWidth={2.5} />
          </g>
        ) : null}
      </svg>

      {point ? (
        <div
          className="animate-pop pointer-events-none absolute top-6 w-[184px] rounded-xl border border-line bg-white px-3.5 py-3 shadow-pop"
          style={{ left: tipLeft }}
        >
          <p className="text-xs font-bold text-ink">{point.label}</p>
          <p className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand" />
              In
            </span>
            <span className="font-semibold tabular-nums text-ink">{naira(point.in)}</span>
          </p>
          <p className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-gold" />
              Out
            </span>
            <span className="font-semibold tabular-nums text-ink">{naira(point.out)}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
