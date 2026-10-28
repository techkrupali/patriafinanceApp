import type { GivingFrequency, GivingKind } from '../api/types';
import { ordinal } from './goalPlan';
import { toYmd } from './format';

export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const NTH = ['', 'First', 'Second', 'Third', 'Fourth'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** GIV-01 "What kind of giving?" */
export const GIVING_KINDS: { value: GivingKind; title: string; line: string; icon: 'plus' | 'moon' | 'heart' | 'user' | 'home'; name: string }[] = [
  { value: 'tithes', title: 'Tithes and offerings', line: 'Church giving on Sundays.', icon: 'plus', name: 'Tithes and offerings' },
  { value: 'zakat', title: 'Zakat and sadaqah', line: 'Yearly zakat with regular sadaqah.', icon: 'moon', name: 'Zakat and sadaqah' },
  { value: 'charity', title: 'Charity', line: 'A cause, orphanage or school.', icon: 'heart', name: 'Charity' },
  { value: 'parents', title: 'Support for parents', line: 'Monthly upkeep for Mama and Papa.', icon: 'user', name: 'Support for parents' },
  { value: 'dues', title: 'Dues and levies', line: 'Town union, age grade, estate.', icon: 'home', name: 'Dues and levies' },
];

/** A giving date's calendar, as the API stores it. */
export interface GivingWhen {
  frequency: GivingFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
  weekOfMonth: number;
  runOn: string | null;
}

const isoDay = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay());

export function fallsOn(w: GivingWhen, d: Date): boolean {
  switch (w.frequency) {
    case 'weekly':
      return isoDay(d) === w.dayOfWeek;
    case 'monthly':
      return d.getDate() === w.dayOfMonth;
    case 'monthly_weekday':
      return isoDay(d) === w.dayOfWeek && Math.ceil(d.getDate() / 7) === w.weekOfMonth;
    case 'once':
      return w.runOn === toYmd(d);
  }
}

/** The next giving date from today (today included). */
export function nextGivingDate(w: GivingWhen, from = new Date()): Date | null {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 400; i++) {
    if (fallsOn(w, d)) return new Date(d);
    d.setDate(d.getDate() + 1);
  }
  return null;
}

/** "First Sunday", "Every Sunday", "On the 15th", "Wed 25 Nov". */
export function whenLabel(w: GivingWhen): string {
  switch (w.frequency) {
    case 'weekly':
      return `Every ${DAY_NAMES[w.dayOfWeek]}`;
    case 'monthly':
      return `On the ${ordinal(w.dayOfMonth)}`;
    case 'monthly_weekday':
      return `${NTH[w.weekOfMonth]} ${DAY_NAMES[w.dayOfWeek]}`;
    case 'once': {
      const d = w.runOn ? new Date(`${w.runOn}T00:00:00`) : null;
      return d ? shortDate(d) : 'Once';
    }
  }
}

/** "Sun 25 Oct" */
export function shortDate(d: Date): string {
  return `${SHORT_DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Sunday, 25 Oct" */
export function longDate(d: Date): string {
  return `${DAY_NAMES[isoDay(d)]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * GIV-05 "Pay the rest": in equal parts on the salary day each month until the
 * pledge is due, or all at once on the day. Naira amounts; the last part takes
 * the rounding.
 */
export function pledgeParts(remaining: number, due: string, plan: 'parts' | 'once', salaryDay = 25, from = new Date()): { date: string; amount: number }[] {
  if (!(remaining > 0)) return [];
  if (plan === 'once') return [{ date: due, amount: remaining }];
  const dueDate = new Date(`${due}T00:00:00`);
  const dates: string[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), salaryDay);
  if (d.getTime() <= from.getTime()) d.setMonth(d.getMonth() + 1);
  while (d.getTime() <= dueDate.getTime() && dates.length < 12) {
    dates.push(toYmd(d));
    d.setMonth(d.getMonth() + 1);
  }
  if (dates.length === 0) return [{ date: due, amount: remaining }];
  const each = Math.floor(remaining / dates.length / 1000) * 1000 || Math.floor(remaining / dates.length);
  return dates.map((date, i) => ({ date, amount: i === dates.length - 1 ? remaining - each * (dates.length - 1) : each }));
}

/** "25 Nov and 25 Dec" */
export function partDates(parts: { date: string }[]): string {
  const days = parts.map((p) => {
    const d = new Date(`${p.date}T00:00:00`);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  });
  return days.length <= 1 ? days[0] ?? '' : `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
}
