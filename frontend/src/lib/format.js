/** "50000.00" | 50000 -> "₦50,000.00" */
export function naira(value, { decimals = 2 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₦0.00';
  return (
    '₦' +
    n.toLocaleString('en-NG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  );
}

/** Backend statement date "12-07-2026 05:16:pm" -> Date */
export function parseStatementDate(s) {
  const m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(am|pm)$/.exec(s || '');
  if (!m) return null;
  let h = Number(m[4]) % 12;
  if (m[6] === 'pm') h += 12;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), h, Number(m[5]));
}

/** Group label for activity feed: Today / Yesterday / "24 Oct, 2023" */
export function dayLabel(date) {
  if (!date) return 'Earlier';
  const now = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = (startOf(now) - startOf(date)) / 86400000;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeLabel(date) {
  if (!date) return '';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Mask an account number: 5011111111 -> 501•••1111 */
export function maskAccount(acc = '') {
  const s = String(acc);
  return s.length >= 8 ? s.slice(0, 3) + '•••' + s.slice(-4) : s;
}
