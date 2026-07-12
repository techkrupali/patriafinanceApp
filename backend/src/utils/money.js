// All amounts are stored as integer kobo (BigInt) to avoid float rounding errors.

/** Parse "22", "22.5", "22.50", 22 -> 2250n kobo. Returns null when invalid. */
function toKobo(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
}

/** 2250n -> "22.50" */
function toNairaString(kobo) {
  const neg = kobo < 0n;
  const k = neg ? -kobo : kobo;
  const naira = k / 100n;
  const rem = (k % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${naira}.${rem}`;
}

/** 2250n -> 22.5 (number, for responses that expect numeric balance) */
function toNairaNumber(kobo) {
  return Number(toNairaString(kobo));
}

/** 334900n -> "₦3,349" (display, drops trailing .00) */
function formatNaira(kobo) {
  const s = toNairaString(kobo);
  let [whole, frac] = s.split('.');
  whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === '00' ? `₦${whole}` : `₦${whole}.${frac}`;
}

/** percent of a kobo amount using integer math, e.g. pct(amount, 4) = 4% */
function pct(kobo, percent) {
  return (kobo * BigInt(Math.round(percent * 100))) / 10000n;
}

module.exports = { toKobo, toNairaString, toNairaNumber, formatNaira, pct };
