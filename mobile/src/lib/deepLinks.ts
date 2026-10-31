/** SYS-08: what a link opens. */
export type DeepLink = { kind: 'invite' } | { kind: 'request'; id: number } | { kind: 'referral'; code: string };

/**
 * patriai://invite · patriai://request/42 · patriai://ref/NGOZI500, or the same
 * on the web (…/i, …/a/42, …/r/NGOZI500, the pages that hand over to the app).
 * Anything else is not a link we open.
 */
export function parseDeepLink(url: string | null | undefined): DeepLink | null {
  if (!url) return null;
  const scheme = url.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase();
  if (!scheme) return null;
  const rest = url.slice(scheme.length + 3).split(/[?#]/)[0];
  // patriai://request/42 → ["request", "42"]; https://host/a/42 → ["a", "42"].
  const parts = (scheme === 'patriai' ? rest : rest.slice(rest.indexOf('/') + 1 || rest.length)).split('/').filter(Boolean);
  const [what, value] = [parts[0]?.toLowerCase(), parts[1]];
  if (what === 'invite' || what === 'i') return { kind: 'invite' };
  if ((what === 'request' || what === 'a') && /^\d{1,10}$/.test(value ?? '')) return { kind: 'request', id: Number(value) };
  if ((what === 'ref' || what === 'r') && /^[A-Za-z0-9_-]{3,32}$/.test(value ?? '')) return { kind: 'referral', code: value!.toUpperCase() };
  return null;
}
