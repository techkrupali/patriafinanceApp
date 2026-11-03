/** SYS-08: what a link opens. */
export type DeepLink =
  /** INV-02 "patriai.app/i/K7Q2" — that invite (or the list without a code); ?decline=1 from the web page. */
  | { kind: 'invite'; code?: string; decline?: boolean }
  | { kind: 'request'; id: number }
  | { kind: 'referral'; code: string }
  /** REQ-03: someone asked you for money (patriai.app/r/N3V8). */
  | { kind: 'moneyRequest'; code: string }
  /** QR-01 pay link: "How much?" for this @tag, maybe with the amount asked. */
  | { kind: 'pay'; tag: string; amount?: string };

/**
 * patriai://invite · patriai://request/42 · patriai://ref/NGOZI500 ·
 * patriai://r/N3V8, or the same on the web (…/i, …/a/42, …/join/NGOZI500,
 * …/r/N3V8, the pages that hand over to the app).
 * Anything else is not a link we open.
 */
export function parseDeepLink(url: string | null | undefined): DeepLink | null {
  if (!url) return null;
  const scheme = url.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase();
  if (!scheme) return null;
  const [rest, query = ''] = url.slice(scheme.length + 3).split('#')[0].split('?');
  // patriai://request/42 → ["request", "42"]; https://host/a/42 → ["a", "42"].
  const parts = (scheme === 'patriai' ? rest : rest.slice(rest.indexOf('/') + 1 || rest.length)).split('/').filter(Boolean);
  const [what, value] = [parts[0]?.toLowerCase(), parts[1]];
  if (what === 'invite' || what === 'i') {
    const code = /^[A-Za-z0-9]{4,12}$/.test(value ?? '') ? value!.toUpperCase() : undefined;
    return code ? { kind: 'invite', code, decline: new URLSearchParams(query).get('decline') === '1' } : { kind: 'invite' };
  }
  if ((what === 'request' || what === 'a') && /^\d{1,10}$/.test(value ?? '')) return { kind: 'request', id: Number(value) };
  if ((what === 'ref' || what === 'join') && /^[A-Za-z0-9_-]{3,32}$/.test(value ?? '')) return { kind: 'referral', code: value!.toUpperCase() };
  if (what === 'r' && /^[A-Za-z0-9]{4,12}$/.test(value ?? '')) return { kind: 'moneyRequest', code: value!.toUpperCase() };
  if (what === 'pay' || what === 'p') {
    const tag = decodeURIComponent(value ?? '').replace(/^@/, '');
    const amount = new URLSearchParams(query).get('amount') ?? undefined;
    if (/^[A-Za-z0-9_.+]{2,30}$/.test(tag)) return { kind: 'pay', tag, amount: amount && /^\d+(\.\d{1,2})?$/.test(amount) ? amount : undefined };
  }
  return null;
}
