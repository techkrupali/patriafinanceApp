/** "13-04-2023" -> Date (start of day, local). Returns null when invalid. */
function parseDMY(s) {
  if (!s || !/^\d{1,2}-\d{1,2}-\d{4}$/.test(String(s).trim())) return null;
  const [d, m, y] = String(s).trim().split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** Date -> "17-02-2025 05:15:pm" (statement/monitoring format) */
function formatStatementDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  let h = date.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${String(h).padStart(2, '0')}:${min}:${ampm}`;
}

/** Date -> "2023-06-26 13:32pm" (query-transaction format) */
function formatQueryDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ampm = date.getHours() >= 12 ? 'pm' : 'am';
  return `${yyyy}-${mm}-${dd} ${h}:${min}${ampm}`;
}

/** Date -> "13-04-2024" */
function formatDMY(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getFullYear()}`;
}

module.exports = { parseDMY, formatStatementDate, formatQueryDate, formatDMY };
