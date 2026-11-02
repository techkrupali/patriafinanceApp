import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtHeroAmount } from '../../components/pt/PtHeroAmount';
import { PtNote, PtPanel, PtReviewRow, PtSegmented } from '../../components/pt/PtForm';
import { PtAvatar, AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { PtAmountBox } from '../../components/pt/PtAmountBox';
import { PtChip } from '../../components/pt/PtChip';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { LoadError } from '../../components/LoadError';
import { useWallets } from '../../api/hooks';
import { useBillSplit, useCreateSplit, useRemindSplit, type MoneyRequest } from '../../api/requests';
import { useAuth } from '../../store/auth';
import { askedOf, useRequestDraft, type AskPerson } from '../../store/requestDraft';
import { initialsOf } from '../../store/sendDraft';
import { namesList } from '../../lib/projects';
import { formatNaira } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

type Method = 'equal' | 'amount' | 'share';

const METHODS: { value: Method; label: string }[] = [
  { value: 'equal', label: 'Equally' },
  { value: 'amount', label: 'By amount' },
  { value: 'share', label: 'By share' },
];

const keyOf = (p: AskPerson) => (p.kind === 'user' ? p.identifier : p.phone);

function Row({ initials, tone, name, sub, right, onPress, last }: { initials: string; tone: (typeof AVATAR_CYCLE)[number]; name: string; sub: string; right?: React.ReactNode; onPress?: () => void; last?: boolean }) {
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
      <PtAvatar initials={initials} size={44} tone={tone} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }} numberOfLines={1}>{name}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }} numberOfLines={1}>{sub}</Text>
      </View>
      {/* Chips align themselves to the top; centre them in the row as the prototype does. */}
      {right ? <View style={{ justifyContent: 'center' }}>{right}</View> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name}, ${sub}`}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** "− 2 +" shares. */
function Shares({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const btn = (icon: 'minus' | 'plus', next: number, disabled: boolean) => (
    <Pressable
      onPress={() => {
        if (disabled) return;
        selection();
        onChange(next);
      }}
      accessibilityState={{ disabled }}
      accessibilityRole="button"
      accessibilityLabel={`${icon === 'plus' ? 'More' : 'Fewer'} shares for ${label}`}
      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
    >
      <Feather name={icon} size={16} color={pt.brand} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {btn('minus', value - 1, value <= 1)}
      <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink, minWidth: 16, textAlign: 'center' }}>{value}</Text>
      {btn('plus', value + 1, value >= 20)}
    </View>
  );
}

function statusChip(r: MoneyRequest) {
  if (r.status === 'paid') return <PtChip label="Paid" tone="success" icon="check" />;
  if (r.status === 'declined') return <PtChip label="Declined" tone="danger" icon="x" />;
  if (r.status === 'cancelled') return <PtChip label="Cancelled" tone="neutral" />;
  return <PtChip label={parseFloat(r.paid_amount) > 0 ? 'Part paid' : 'Asked'} tone="warning" icon="clock" />;
}

/** "Paid by you at Yellow Chilli, 18 Oct" */
function paidLine(place: string | null | undefined, iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return `Paid by you${place ? ` at ${place}` : ''}, ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
}

/**
 * SPL-01 Split a bill you paid: equally (you're counted in), by amount or by
 * share; everyone else is asked for their part (people not on Patriai get the
 * link by text); then who has paid, "Back to you so far", and remind the rest.
 */
export function SplitBillScreen({ navigation, route }: RootScreenProps<'SplitBill'>) {
  const key = route.params?.key;
  return key ? <SplitStatus splitKey={key} navigation={navigation} /> : <NewSplit navigation={navigation} route={route} />;
}

function NewSplit({ navigation, route }: Pick<RootScreenProps<'SplitBill'>, 'navigation' | 'route'>) {
  const me = useAuth((s) => s.user);
  const wallets = useWallets();
  const people = useRequestDraft((s) => s.people);
  const removePerson = useRequestDraft((s) => s.removePerson);
  const create = useCreateSplit();
  const [title, setTitle] = useState(route.params?.title ?? '');
  const [place, setPlace] = useState(route.params?.place ?? '');
  const [total, setTotal] = useState(route.params?.total ?? '');
  const [method, setMethod] = useState<Method>('equal');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [shares, setShares] = useState<Record<string, number>>({});
  const [myShares, setMyShares] = useState(1);
  const [walletId, setWalletId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new bill starts with no one on it.
  useEffect(() => useRequestDraft.setState({ people: [] }), []);

  const into = (wallets.data ?? []).filter((w) => !w.closed && w.status !== 'suspended');
  const wallet = into.find((w) => w.id === walletId) ?? into.find((w) => w.type === 'main') ?? into[0];
  const t = parseFloat(total) || 0;
  const allShares = people.reduce((s, p) => s + (shares[keyOf(p)] ?? 1), 0) + myShares;
  // What each person is asked for, as the server works it out (whole kobo, the rest stays with you).
  const partOf = (p: AskPerson): number =>
    method === 'amount' ? parseFloat(amounts[keyOf(p)] ?? '') || 0 : method === 'share' ? Math.floor((t * 100 * (shares[keyOf(p)] ?? 1)) / allShares) / 100 : Math.floor((t * 100) / (people.length + 1)) / 100;
  const asked = people.reduce((s, p) => s + partOf(p), 0);
  const mine = Math.max(0, t - asked);
  const over = method === 'amount' && asked > t;
  const missing = method === 'amount' && people.some((p) => !partOf(p));
  const ok = title.trim() && t > 0 && people.length > 0 && wallet && !over && !missing;

  const send = () => {
    if (!ok || !wallet) return;
    setError(null);
    create.mutate(
      {
        title: title.trim(),
        place: place.trim() || undefined,
        total: String(t),
        method,
        wallet_id: wallet.id,
        my_shares: method === 'share' ? myShares : undefined,
        people: people.map((p) => ({ ...askedOf(p), amount: method === 'amount' ? amounts[keyOf(p)] : undefined, shares: method === 'share' ? shares[keyOf(p)] ?? 1 : undefined })),
      },
      {
        onSuccess: (s) => {
          notifySuccess();
          navigation.replace('SplitBill', { key: s.key });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <PtPageScreen
      title="Split a bill"
      subtitle={title.trim() || 'Share a bill you paid'}
      onBack={() => navigation.goBack()}
      footer={<PtButton title={people.length ? `Ask ${people.length === 1 ? keyName(people[0]) : `${people.length} people`}` : 'Add who to split with'} onPress={send} disabled={!ok} loading={create.isPending} />}
    >
      <PtField label="What was it?" value={title} onChangeText={setTitle} placeholder="Mama's birthday dinner" maxLength={120} />
      <PtField label="Where (optional)" value={place} onChangeText={setPlace} placeholder="Yellow Chilli" maxLength={120} />
      <View style={{ alignItems: 'center', gap: 4, paddingVertical: 6 }}>
        <PtHeroAmount value={total} onChange={setTotal} label="What the bill came to" />
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{paidLine(place.trim())}</Text>
      </View>

      <PtSegmented options={METHODS} value={method} onChange={setMethod} />

      <PtPanel>
        <Row
          initials={initialsOf(`${me?.first_name ?? ''} ${me?.last_name ?? ''}`)}
          tone="deep"
          name={`${me?.first_name ?? 'You'} (you)`}
          sub={t ? `Paid the bill · your part ${formatNaira(String(mine))}` : 'Paid the bill'}
          right={method === 'share' ? <Shares value={myShares} onChange={setMyShares} label="you" /> : <PtChip label="Paid" tone="success" icon="check" />}
          last={!people.length}
        />
        {people.map((p, i) => (
          <Row
            key={keyOf(p)}
            initials={initialsOf(p.name)}
            tone={AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
            name={p.name}
            sub={p.kind === 'outside' ? 'Not on Patriai · gets a link' : method === 'equal' && t ? `${formatNaira(String(partOf(p)))} each` : method === 'share' && t ? formatNaira(String(partOf(p))) : p.sub ?? 'On Patriai'}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {method === 'amount' ? (
                  <PtAmountBox value={amounts[keyOf(p)] ?? ''} onChange={(v) => setAmounts((a) => ({ ...a, [keyOf(p)]: v }))} label={`Amount for ${p.name}`} width={110} />
                ) : method === 'share' ? (
                  <Shares value={shares[keyOf(p)] ?? 1} onChange={(n) => setShares((s) => ({ ...s, [keyOf(p)]: n }))} label={p.name} />
                ) : null}
                <Pressable onPress={() => removePerson(i)} accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`} hitSlop={8}>
                  <Feather name="x" size={18} color={pt.inkMuted} />
                </Pressable>
              </View>
            }
            last={i === people.length - 1}
          />
        ))}
      </PtPanel>

      <Pressable
        onPress={() => {
          selection();
          navigation.navigate('SendRecipient', { purpose: 'split' });
        }}
        accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: pt.lineStrong, borderRadius: ptRadius.md, paddingHorizontal: 16, paddingVertical: 16 }}
      >
        <Feather name="user-plus" size={20} color={pt.brand} />
        <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>Add someone</Text>
      </Pressable>

      <PtPanel>
        <PtReviewRow label="Paid back into" value={wallet?.name ?? 'Choose a wallet'} onEdit={() => setPicking(true)} />
        <PtReviewRow label="Back to you" value={formatNaira(String(asked))} sub={t ? `of ${formatNaira(String(t))}; your part is ${formatNaira(String(mine))}` : null} last />
      </PtPanel>

      {over ? <PtNote tone="attention">{`That's ${formatNaira(String(asked - t))} more than the bill.`}</PtNote> : missing ? <PtNote tone="info">Give everyone an amount.</PtNote> : null}
      {error ? <PtNote tone="attention">{error}</PtNote> : null}

      <PtOptionSheet
        visible={picking}
        title="Paid back into"
        options={into.map((w) => ({ value: w.id, label: w.name }))}
        value={wallet?.id ?? null}
        onPick={(v) => {
          setWalletId(v);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </PtPageScreen>
  );
}

const keyName = (p: AskPerson) => p.name.split(' ')[0];

function SplitStatus({ splitKey, navigation }: { splitKey: string; navigation: RootScreenProps<'SplitBill'>['navigation'] }) {
  const me = useAuth((s) => s.user);
  const q = useBillSplit(splitKey);
  const remind = useRemindSplit(splitKey);
  const s = q.data;
  const waiting = s?.waiting ?? [];

  return (
    <PtPageScreen
      title="Split a bill"
      subtitle={s?.title ?? null}
      onBack={() => navigation.goBack()}
      footer={
        waiting.length ? (
          <PtButton
            title={`Remind ${namesList(waiting)}`}
            loading={remind.isPending}
            onPress={() => remind.mutate(undefined, { onSuccess: () => showAlert('Reminder sent', `We nudged ${namesList(waiting)}.`), onError: (e) => showAlert('Not sent', e.message) })}
          />
        ) : (
          <PtButton title="Done" onPress={() => navigation.popToTop()} />
        )
      }
    >
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !s ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: 4, paddingVertical: 6 }}>
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 44, letterSpacing: -1, color: pt.ink }}>{formatNaira(s.total)}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>{paidLine(s.place, s.created_at)}</Text>
          </View>
          <View pointerEvents="none" accessibilityLabel={`Split ${METHODS.find((m) => m.value === s.method)?.label.toLowerCase()}`}>
            <PtSegmented options={METHODS} value={s.method} onChange={() => undefined} />
          </View>
          <PtPanel>
            <Row
              initials={initialsOf(`${me?.first_name ?? ''} ${me?.last_name ?? ''}`)}
              tone="deep"
              name={`${me?.first_name ?? 'You'} (you)`}
              sub={s.place ? `Paid at ${s.place}` : 'Paid the bill'}
              right={<PtChip label="Paid" tone="success" icon="check" />}
              last={!s.people.length}
            />
            {s.people.map((r, i) => (
              <Row
                key={r.code}
                initials={initialsOf(r.payer.name ?? '?')}
                tone={AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
                name={(r.payer.name ?? '').split(' ')[0]}
                sub={!r.payer.on_patriai && r.status === 'pending' ? 'Not on Patriai · link sent' : s.method === 'equal' ? `${formatNaira(r.amount)} each` : formatNaira(r.amount)}
                right={statusChip(r)}
                onPress={() => navigation.navigate('IncomingRequest', { code: r.code })}
                last={i === s.people.length - 1}
              />
            ))}
          </PtPanel>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 16, color: pt.inkMuted }}>Back to you so far</Text>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{`${formatNaira(s.back)} of ${formatNaira(s.asked)}`}</Text>
          </View>
        </>
      )}
    </PtPageScreen>
  );
}
