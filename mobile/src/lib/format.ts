/** '₦' + en-NG grouped amount with 2dp. Accepts the API's naira decimal strings. */
export function formatMoney(value: string | number | null | undefined): string {
  const num = typeof value === 'number' ? value : parseFloat(value ?? '0');
  const safe = Number.isFinite(num) ? num : 0;
  return (
    '₦' +
    safe.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/**
 * Clean raw text from an amount field down to a plain number string:
 * digits, at most one decimal point, at most 2 decimal places, no grouping.
 * This is what should be stored in state / sent to the API.
 */
export function sanitizeAmountInput(text: string): string {
  let s = text.replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) {
    const intPart = s.slice(0, dot);
    const decPart = s.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    s = intPart + '.' + decPart;
  }
  return s;
}

/**
 * Display a raw amount string with thousands separators as the user types,
 * so it's easy to count zeros: '100000000' → '100,000,000', '1000.5' → '1,000.5'.
 * Preserves a trailing dot and partial decimals mid-typing.
 */
export function groupAmountInput(raw: string): string {
  if (!raw) return '';
  const dot = raw.indexOf('.');
  const intPart = dot === -1 ? raw : raw.slice(0, dot);
  const rest = dot === -1 ? '' : raw.slice(dot);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return grouped + rest;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 'Today' / 'Yesterday' / '12 Jul 2026' */
export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** '12 Jul, 3:45 PM' */
export function timeLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hours}:${mins} ${ampm}`;
}

// ---- Calendar dates (YYYY-MM-DD, local — no timezone shifts) ----

export function parseYmd(ymd: string | null | undefined): Date | null {
  const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** '2026-10-18' → '18 Oct 2026' */
export function formatYmd(ymd: string | null | undefined): string {
  const d = parseYmd(ymd);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
}

/** Today + n months, as YYYY-MM-DD. */
export function ymdMonthsFromNow(months: number): string {
  const d = new Date();
  return toYmd(new Date(d.getFullYear(), d.getMonth() + months, d.getDate()));
}

/** Humanize a transaction type slug: 'transfer_out' → 'Transfer out' */
export function humanizeType(type: string): string {
  const s = type.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
