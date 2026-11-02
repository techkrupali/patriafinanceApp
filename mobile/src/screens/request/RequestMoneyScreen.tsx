import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtHeroAmount } from '../../components/pt/PtHeroAmount';
import { PtGroupLabel, PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { useWallets } from '../../api/hooks';
import { useCreateMoneyRequest } from '../../api/requests';
import { askedOf, useRequestDraft } from '../../store/requestDraft';
import { initialsOf } from '../../store/sendDraft';
import { parseYmd, toYmd } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

/** "Friday, 30 Oct" */
export function dueLabel(ymd: string | null | undefined): string {
  const d = parseYmd(ymd);
  return d ? `${d.toLocaleDateString('en-GB', { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}` : 'No due date';
}

/**
 * REQ-01 Request money: how much, from whom (Change → SND-03), what for, which
 * of your wallets it's paid into and when it's due → REQ-02 the link.
 */
export function RequestMoneyScreen({ navigation }: RootScreenProps<'RequestMoney'>) {
  const wallets = useWallets();
  const { payer, reset } = useRequestDraft();
  const create = useCreateMoneyRequest();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [walletId, setWalletId] = useState<number | null>(null);
  const [due, setDue] = useState(() => toYmd(new Date(Date.now() + 7 * 86_400_000)));
  const [picking, setPicking] = useState<'wallet' | 'due' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A fresh request each time; the person picked on SND-03 comes back through the draft.
  useEffect(() => reset(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Any of your wallets can be paid into (a paused one still takes money in).
  const into = (wallets.data ?? []).filter((w) => !w.closed && w.status !== 'suspended');
  const wallet = into.find((w) => w.id === walletId) ?? into.find((w) => w.type === 'main') ?? into[0];
  const n = parseFloat(amount) || 0;
  const year = new Date().getFullYear();

  const send = () => {
    if (!payer || !wallet) return;
    setError(null);
    create.mutate(
      { ...askedOf(payer), amount: String(n), note: note.trim() || undefined, wallet_id: wallet.id, due_on: due },
      { onSuccess: (r) => navigation.replace('RequestSent', { code: r.code }), onError: (e) => setError(e.message) },
    );
  };

  return (
    <PtPageScreen
      title="Request money"
      subtitle="Ask someone to pay you"
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Send request" onPress={send} disabled={!payer || !wallet || n < 1} loading={create.isPending} />}
    >
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <PtHeroAmount value={amount} onChange={setAmount} label="Amount to ask for" />
      </View>

      <View style={{ gap: 10 }}>
        <PtGroupLabel>From</PtGroupLabel>
        {payer ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14 }}>
            <PtAvatar initials={initialsOf(payer.name)} size={40} tone={payer.kind === 'user' ? 'brand' : 'gold'} uri={payer.kind === 'user' ? payer.avatarUrl : null} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }} numberOfLines={1}>{payer.name}</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }} numberOfLines={1}>
                {payer.kind === 'user' ? payer.sub ?? payer.identifier : `Not on Patriai · ${payer.phone}`}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('SendRecipient', { purpose: 'request' });
              }}
              accessibilityRole="button"
              accessibilityLabel="Change who pays"
              hitSlop={8}
            >
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Change</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              selection();
              navigation.navigate('SendRecipient', { purpose: 'request' });
            }}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: pt.lineStrong, borderRadius: ptRadius.md, paddingHorizontal: 16, paddingVertical: 16 }}
          >
            <Feather name="user-plus" size={20} color={pt.brand} />
            <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>Choose who pays</Text>
          </Pressable>
        )}
      </View>

      <PtField label="What for" value={note} onChangeText={setNote} placeholder="Your half of the hospital bill" maxLength={200} />

      <PtPanel>
        <PtReviewRow label="Pay into" value={wallet?.name ?? 'Choose a wallet'} sub={wallet?.status === 'frozen' ? 'Paused · it still takes money in' : null} onEdit={() => setPicking('wallet')} />
        <PtReviewRow label="Due" value={dueLabel(due)} onEdit={() => setPicking('due')} last />
      </PtPanel>

      {error ? <PtNote tone="attention">{error}</PtNote> : null}

      <PtButton title="Split a bill with several people" variant="ghost" onPress={() => navigation.navigate('SplitBill')} />

      <PtOptionSheet
        visible={picking === 'wallet'}
        title="Pay into"
        options={into.map((w) => ({ value: w.id, label: w.name }))}
        value={wallet?.id ?? null}
        onPick={(v) => {
          setWalletId(v);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
      <PtDateSheet
        visible={picking === 'due'}
        title="Due"
        value={due}
        minYear={year}
        maxYear={year + 2}
        doneLabel="Done"
        onDone={(ymd) => {
          // Not before today.
          setDue(ymd < toYmd(new Date()) ? toYmd(new Date()) : ymd);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </PtPageScreen>
  );
}
