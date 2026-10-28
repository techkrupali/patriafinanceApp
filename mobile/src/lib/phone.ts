/**
 * Phone helpers — keep the backend `users.phone` column clean by always
 * storing E.164 (e.g. +2348035591258): a leading '+', the country calling
 * code, then the national number with any local trunk '0' stripped.
 *
 * The country list is a small in-repo dataset (no native dependency, Expo-safe).
 * Flags are derived from the ISO-3166 alpha-2 code via regional-indicator
 * codepoints, so we don't ship an emoji table.
 */

export interface Country {
  name: string;
  iso2: string;
  /** Calling code without the leading '+'. */
  dial: string;
}

/** 🇳🇬 from "NG" — two regional-indicator symbols. */
export function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/** Curated list — Nigeria first (primary market), then common diaspora / African markets, then A→Z. */
export const COUNTRIES: Country[] = [
  { name: 'Nigeria', iso2: 'NG', dial: '234' },
  { name: 'Ghana', iso2: 'GH', dial: '233' },
  { name: 'Kenya', iso2: 'KE', dial: '254' },
  { name: 'South Africa', iso2: 'ZA', dial: '27' },
  { name: 'United Kingdom', iso2: 'GB', dial: '44' },
  { name: 'United States', iso2: 'US', dial: '1' },
  { name: 'Canada', iso2: 'CA', dial: '1' },
  { name: 'Australia', iso2: 'AU', dial: '61' },
  { name: 'Benin', iso2: 'BJ', dial: '229' },
  { name: 'Cameroon', iso2: 'CM', dial: '237' },
  { name: "Côte d'Ivoire", iso2: 'CI', dial: '225' },
  { name: 'Egypt', iso2: 'EG', dial: '20' },
  { name: 'Ethiopia', iso2: 'ET', dial: '251' },
  { name: 'France', iso2: 'FR', dial: '33' },
  { name: 'Gambia', iso2: 'GM', dial: '220' },
  { name: 'Germany', iso2: 'DE', dial: '49' },
  { name: 'India', iso2: 'IN', dial: '91' },
  { name: 'Ireland', iso2: 'IE', dial: '353' },
  { name: 'Italy', iso2: 'IT', dial: '39' },
  { name: 'Liberia', iso2: 'LR', dial: '231' },
  { name: 'Morocco', iso2: 'MA', dial: '212' },
  { name: 'Netherlands', iso2: 'NL', dial: '31' },
  { name: 'Niger', iso2: 'NE', dial: '227' },
  { name: 'Rwanda', iso2: 'RW', dial: '250' },
  { name: 'Saudi Arabia', iso2: 'SA', dial: '966' },
  { name: 'Senegal', iso2: 'SN', dial: '221' },
  { name: 'Sierra Leone', iso2: 'SL', dial: '232' },
  { name: 'Spain', iso2: 'ES', dial: '34' },
  { name: 'Tanzania', iso2: 'TZ', dial: '255' },
  { name: 'Togo', iso2: 'TG', dial: '228' },
  { name: 'Uganda', iso2: 'UG', dial: '256' },
  { name: 'United Arab Emirates', iso2: 'AE', dial: '971' },
  { name: 'Zambia', iso2: 'ZM', dial: '260' },
  { name: 'Zimbabwe', iso2: 'ZW', dial: '263' },
];

export const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((c) => c.iso2 === 'NG') ?? COUNTRIES[0];

export function findCountryByIso(iso2: string): Country | undefined {
  return COUNTRIES.find((c) => c.iso2.toLowerCase() === iso2.toLowerCase());
}

/** Case-insensitive search over name and dial code, for the picker. */
export function searchCountries(query: string): Country[] {
  const q = query.trim().toLowerCase().replace(/^\+/, '');
  if (!q) return COUNTRIES;
  return COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q),
  );
}

/**
 * Compose an E.164 string from a country dial code and a national number as
 * typed. Strips non-digits and any local trunk zero(s): NG local 08035591258
 * with dial 234 → +2348035591258.
 */
export function toE164(dial: string, national: string): string {
  const d = dial.replace(/\D/g, '');
  const n = national.replace(/\D/g, '').replace(/^0+/, '');
  return `+${d}${n}`;
}

/** E.164 shape check: '+' then 8–15 digits, first digit non-zero. */
export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/** Display grouping for a national number as typed: NG 8034127790 → "803 412 7790". */
export function formatNational(dial: string, digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (dial === '234') {
    const n = d.replace(/^0/, '');
    const lead = d.length - n.length; // keep a typed trunk 0 as-is
    const parts = [n.slice(0, 3), n.slice(3, 6), n.slice(6)].filter(Boolean);
    return (lead ? '0' : '') + parts.join(' ');
  }
  return d.replace(/(\d{3})(?=\d)/g, '$1 ');
}

/** "+2348034127790" → "+234 803 412 7790", using the longest matching dial code. */
export function formatE164(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  const match = COUNTRIES.filter((c) => digits.startsWith(c.dial)).sort((a, b) => b.dial.length - a.dial.length)[0];
  if (!match) return e164;
  return `+${match.dial} ${formatNational(match.dial, digits.slice(match.dial.length))}`;
}

/** "0803 •••• 214" — enough to recognise a number without showing it (matches the server's mask). */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  const local = digits.startsWith('234') ? `0${digits.slice(3)}` : digits;
  return local.length >= 7 ? `${local.slice(0, 4)} •••• ${local.slice(-3)}` : e164;
}
