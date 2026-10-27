import { useLanguage, type Lang } from '../store/language';

/**
 * Home tab wording. English and Pidgin follow the prototype's two Home
 * screens (HOM-01 and HOM-01 Pidgin).
 */
const en = {
  greeting: (hour: number): string => (hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,'),
  everything: (n: number) => `EVERYTHING · ${n} WALLET${n === 1 ? '' : 'S'}`,
  breakdown: (yours: string, shared: string, children: string) =>
    `${yours} yours · ${shared} shared · ${children} children ›`,
  send: 'Send',
  addMoney: 'Add money',
  move: 'Move',
  more: 'More',
  needYou: (n: number) => `${n} need${n === 1 ? 's' : ''} you:`,
  next7: 'Next 7 days',
  seeAll: 'See all',
  today: 'Today',
  nothingDue: 'Nothing due this week. Rules and requests show up here.',
  review: 'Review',
  newGoal: 'New goal',
  sheetTitle: 'What would you like to do?',
  soon: 'soon',
  actions: {
    send: ['Send money', 'To family, a bank account or a vendor'],
    bills: ['Pay bills', 'Airtime, data, electricity, TV'],
    add: ['Add money', 'Bank transfer, card or a Patriai agent'],
    request: ['Request money', 'Ask someone to pay you or chip in'],
    wallet: ['New wallet', 'Spending, savings, project, child and more'],
    goal: ['New goal', 'School fees, rent, a car, a newborn'],
    scan: ['Scan to pay', 'Pay a shop or agent by QR code'],
    invite: ['Invite family', 'Add a spouse, child, relative or vendor'],
  },
};

type Copy = typeof en;

const pcm: Copy = {
  greeting: () => 'How you dey,',
  everything: (n) => `ALL YOUR MONEY · ${n} WALLET${n === 1 ? '' : 'S'}`,
  breakdown: (yours, shared, children) => `${yours} your own · ${shared} we share · ${children} pikin ›`,
  send: 'Send',
  addMoney: 'Put money',
  move: 'Move am',
  more: 'More',
  needYou: (n) => `${n} tin${n === 1 ? '' : 's'} dey wait you:`,
  next7: 'Wetin dey come this week',
  seeAll: 'See all',
  today: 'Today',
  nothingDue: 'Nothing dey due this week. Rules and request go show here.',
  review: 'Check am',
  newGoal: 'New goal',
  sheetTitle: 'Wetin you wan do?',
  soon: 'soon',
  actions: {
    send: ['Send money', 'To family, bank account or vendor'],
    bills: ['Pay bills', 'Airtime, data, light, TV'],
    add: ['Put money', 'Bank transfer, card or Patriai agent'],
    request: ['Ask for money', 'Make person pay you or join hand'],
    wallet: ['New wallet', 'Spending, savings, project, pikin and more'],
    goal: ['New goal', 'School fees, rent, motor, new baby'],
    scan: ['Scan to pay', 'Pay shop or agent with QR code'],
    invite: ['Invite family', 'Add your spouse, pikin, relative or vendor'],
  },
};

const copies: Record<Lang, Copy> = { en, pcm };

export function useHomeCopy(): Copy {
  return copies[useLanguage((s) => s.lang)];
}
