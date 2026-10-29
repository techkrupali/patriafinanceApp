import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { formatNaira, formatYmd } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { Transaction, WalletState } from '../../api/types';

type IconName = React.ComponentProps<typeof Feather>['name'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A 44pt icon button in a page's top bar (download, settings). */
export function HeaderIcon({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Feather name={icon} size={22} color={pt.ink} />
    </Pressable>
  );
}

/** WAL-06 settings row: icon tile, title, a line under it, chevron; red for "Close or archive". */
export function SettingsRow({
  icon,
  title,
  sub,
  onPress,
  danger = false,
  last = false,
}: {
  icon: IconName;
  title: string;
  sub?: string | null;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const body = (
    <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line, opacity: onPress ? 1 : 0.6 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? pt.dangerSoft : pt.brandSoft }}>
        <Feather name={icon} size={17} color={danger ? pt.danger : pt.brand} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontFamily: ptFont.semibold, fontSize: 16, lineHeight: 22, color: danger ? pt.danger : pt.ink }}>{title}</Text>
        {sub ? (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {onPress ? <Feather name="chevron-right" size={18} color={pt.inkSubtle} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
    >
      {body}
    </Pressable>
  );
}

const STATE_TONES = {
  paused: { bg: pt.sunken, icon: 'pause' as IconName, fg: pt.ink },
  restricted: { bg: '#FDEBC8', icon: 'alert-circle' as IconName, fg: '#8F5400' },
  locked: { bg: pt.brandSoft, icon: 'lock' as IconName, fg: pt.brand },
  suspended: { bg: pt.dangerSoft, icon: 'alert-triangle' as IconName, fg: pt.danger },
  archived: { bg: pt.sunken, icon: 'archive' as IconName, fg: pt.ink },
};

/** "Paused by Ngozi", "Locked until 5 Jan 2027" … with what to say and do (WAL-12). */
export function stateNotice(state: WalletState): { tone: keyof typeof STATE_TONES; title: string; body: string } {
  switch (state.kind) {
    case 'paused':
      return { tone: 'paused', title: state.by ? `Paused by ${state.me ? 'you' : state.by}` : 'Paused', body: 'Rules and payments are stopped. Money can still come in.' };
    case 'restricted':
      return {
        tone: 'restricted',
        title: 'Restricted',
        body: `Payments over ${state.limit ? `${formatNaira(state.limit)} a day` : 'the limit'} are on hold until ${state.me ? 'you finish' : `${state.who} finishes`} verification.`,
      };
    case 'locked':
      return {
        tone: 'locked',
        title:
          state.mode === 'date' && state.until
            ? `Locked until ${formatYmd(state.until)}`
            : state.mode === 'target'
              ? `Locked until ${formatNaira(state.opens_at)} is in`
              : `Locked until ${state.agree ?? 'everyone'} agree`,
        body: state.can_ask ? "Money can come in. Taking money out needs everyone's yes." : 'Money can come in. Nothing goes out until it opens.',
      };
    case 'suspended':
      return { tone: 'suspended', title: 'Suspended', body: 'We noticed unusual activity and stopped this wallet to protect it. Your money is safe.' };
    default:
      return {
        tone: 'archived',
        title: `${state.kind === 'closed' ? 'Closed' : 'Archived'}${state.at ? ` on ${formatYmd(state.at.slice(0, 10))}` : ''}`,
        body: state.kind === 'closed' ? 'History is kept for 6 years, then deleted.' : 'Read only. History and statements stay available.',
      };
  }
}

/** WAL-12 notice card with its one action ("Resume wallet", "Ask to unlock"…). */
export function StateNotice({ state, action, onAction }: { state: WalletState; action?: string | null; onAction?: () => void }) {
  const n = stateNotice(state);
  const t = STATE_TONES[n.tone];
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: ptRadius.md, padding: 16, flexDirection: 'row', gap: 12 }} accessibilityRole="summary">
      <Feather name={t.icon} size={20} color={t.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 16, lineHeight: 22, color: pt.ink }}>{n.title}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>{n.body}</Text>
        {action && onAction ? (
          <Pressable
            onPress={() => {
              selection();
              onAction();
            }}
            hitSlop={8}
            accessibilityRole="button"
            style={{ alignSelf: 'flex-start', marginTop: 4 }}
          >
            <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** "Today, 9:12 am" · "Yesterday" · "1 Oct". */
export function whenLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) {
    const h = d.getHours() % 12 || 12;
    return `Today, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
  }
  if (days === 1) return 'Yesterday';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

/** "18 Oct, 9:14 am". */
export function stampLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}

/** "OCTOBER", or "OCTOBER 2025" for another year. */
export function monthHeading(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${MONTH_NAMES[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

/** "Emeka added money" when someone else paid in; a rule by its name; otherwise the description. */
export function activityTitle(t: Transaction, myId: number | undefined): string {
  if (t.rule) return t.rule;
  if (t.direction === 'credit' && t.by && t.by.id !== myId) return `${t.by.first_name} added money`;
  if (t.direction === 'credit' && t.by && t.by.id === myId && t.type === 'transfer_in') return 'You added money';
  const source = t.counterparty && typeof t.counterparty.source_name === 'string' ? t.counterparty.source_name : null;
  if (t.direction === 'credit' && t.type === 'fund' && source) return `${source} added money`;
  return t.description || (t.direction === 'credit' ? 'Money in' : 'Money out');
}

/** "25 Sep · Ngozi · rule" / "Today, 9:12 am". */
export function activitySub(t: Transaction, myId: number | undefined, withDate = true): string {
  return [
    withDate ? whenLabel(t.created_at) : null,
    t.rule && t.by ? (t.by.id === myId ? 'You' : t.by.first_name) : null,
    t.rule ? 'rule' : null,
    t.status !== 'successful' ? t.status.charAt(0).toUpperCase() + t.status.slice(1) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** One money row: arrow tile, title and when, +₦ / −₦. */
export function ActivityRow({ t, myId, last = false }: { t: Transaction; myId: number | undefined; last?: boolean }) {
  const credit = t.direction === 'credit';
  return (
    <View style={{ minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: credit ? pt.brandSoft : pt.sunken }}>
        <Feather name={credit ? 'arrow-down-left' : 'arrow-up-right'} size={18} color={credit ? pt.brand : pt.inkMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: ptFont.semibold, fontSize: 16, lineHeight: 22, color: pt.ink }} numberOfLines={2}>
          {activityTitle(t, myId)}
        </Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }} numberOfLines={1}>
          {activitySub(t, myId)}
        </Text>
      </View>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: credit ? pt.emerald500 : pt.ink }}>
        {credit ? '+' : '−'}
        {formatNaira(t.amount)}
      </Text>
    </View>
  );
}

/** The dashed "+ Add someone to this wallet" link row. */
export function AddLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}
    >
      <Feather name="plus" size={20} color={pt.brand} />
      <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>{label}</Text>
    </Pressable>
  );
}

/** Who decides, in words: "any one approver", "Ngozi and Emeka". */
export function deciders(mode: string | null | undefined, approvers: string[], named: string[]): string {
  const join = (n: string[]) => (n.length <= 1 ? n[0] ?? 'an approver' : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);
  if (mode === 'named') return join(named);
  if (mode === 'all') return `everyone (${join(approvers)})`;
  if (mode === 'majority') return `most of ${join(approvers)}`;
  if (mode === 'any') return approvers.length > 1 ? `any one of ${join(approvers)}` : join(approvers);
  return join(approvers);
}

/** WAL-06 "Over ₦50,000: Ngozi and Emeka" / "Every payment: any one approver" / "Off". */
export function rulesLine(opts: { enabled: boolean; threshold: string | null; mode: string | null | undefined; approvers: string[]; named: string[] }): string {
  if (!opts.enabled) return 'Off. Owners pay out directly';
  const who = deciders(opts.mode, opts.approvers, opts.named);
  return `${opts.threshold && parseFloat(opts.threshold) > 0 ? `Over ${formatNaira(opts.threshold)}` : 'Every payment'}: ${who.charAt(0).toUpperCase()}${who.slice(1)}`;
}

/** The access-schedule window in words: "Mon–Fri, 08:00–18:00". */
export function scheduleLine(s: { days: number[]; start: string; end: string } | null | undefined): string {
  if (!s || !s.days?.length) return 'Any time';
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days = [...s.days].sort((a, b) => a - b);
  const run = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const label = days.length === 7 ? 'Every day' : run && days.length > 2 ? `${names[days[0] - 1]}–${names[days[days.length - 1] - 1]}` : days.map((d) => names[d - 1]).join(', ');
  return `${label}, ${s.start}–${s.end}`;
}
