import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtGroupLabel, PtNote, PtPanel, PtSegmented } from '../../components/pt/PtForm';
import { PtRow } from '../../components/pt/PtList';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtCheckbox } from '../../components/pt/PtCheck';
import { LoadError } from '../../components/LoadError';
import { useSavedAccounts } from '../../api/hooks';
import { useSavedGroup, useUpdateSavedGroup } from '../../api/payments';
import { initialsOf, useSendDraft } from '../../store/sendDraft';
import { formatNaira } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

type Split = 'even' | 'percent' | 'fixed';

/**
 * BEN-04 Account group ("Our churches · Group · 2 accounts"): each account and
 * its share, the default split — evenly, by % or fixed amounts — adding
 * accounts, and paying the whole group at once.
 */
export function SavedGroupScreen({ navigation, route }: RootScreenProps<'SavedGroup'>) {
  const id = route.params.id;
  const q = useSavedGroup(id);
  const all = useSavedAccounts();
  const update = useUpdateSavedGroup(id);
  const start = useSendDraft((s) => s.start);
  const setRecipient = useSendDraft((s) => s.setRecipient);
  const setAmount = useSendDraft((s) => s.setAmount);
  const g = q.data;
  const [split, setSplit] = useState<Split>('even');
  const [shares, setShares] = useState<Record<number, string>>({});
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!g) return;
    setSplit(g.split ?? 'even');
    setShares(Object.fromEntries(g.accounts.map((a) => [a.id, a.share != null ? String(g.split === 'fixed' ? a.share / 100 : a.share) : ''])));
    setPicked(g.accounts.map((a) => a.id));
  }, [g?.id, g?.split, g?.accounts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = g?.accounts.length ?? 0;
  const shareLabel = (aid: number) => (split === 'even' ? `${Math.round(100 / Math.max(1, n))}%` : split === 'percent' ? `${shares[aid] || 0}%` : formatNaira(shares[aid] || '0'));
  const total = Object.values(shares).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const dirty = g && (split !== (g.split ?? 'even') || g.accounts.some((a) => (shares[a.id] ?? '') !== (a.share != null ? String(g.split === 'fixed' ? a.share / 100 : a.share) : '')));
  const banks = (all.data?.accounts ?? []).filter((a) => picked.includes(a.id) && a.kind !== 'patriai').length;

  const saveSplit = () => {
    setError(null);
    update.mutate(
      { split, ...(split === 'even' ? {} : { shares: Object.fromEntries(Object.entries(shares).map(([k, v]) => [Number(k), parseFloat(v) || 0])) }) },
      { onSuccess: () => notifySuccess(), onError: (e) => setError(e.message) },
    );
  };

  const pay = () => {
    if (!g) return;
    start();
    const fixedTotal = split === 'fixed' ? total : undefined;
    setRecipient({ kind: 'group', name: g.name, groupId: g.id, sub: `${n} accounts · ${g.split_label ?? 'split evenly'}`, banks, fixedTotal });
    if (fixedTotal) setAmount(String(fixedTotal));
    navigation.navigate('SendAmount');
  };

  return (
    <PtPageScreen
      title={g?.name ?? 'Group'}
      subtitle={g ? `Group · ${n} account${n === 1 ? '' : 's'}` : null}
      onBack={() => navigation.goBack()}
      footer={
        g ? (
          <View style={{ gap: 4 }}>
            {dirty ? <PtButton title="Save split" onPress={saveSplit} loading={update.isPending} /> : null}
            <PtButton title="Pay this group" variant={dirty ? 'secondary' : 'primary'} onPress={pay} disabled={Boolean(dirty)} />
          </View>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !g ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <PtPanel>
            {g.accounts.map((a, i) => (
              <PtRow
                key={a.id}
                title={a.nickname}
                subtitle={[a.area, a.verified ? 'verified' : null].filter(Boolean).join(' · ') || ' '}
                left={<PtAvatar initials={initialsOf(a.nickname)} size={40} tone="deep" />}
                right={
                  split === 'even' ? (
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{shareLabel(a.id)}</Text>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: pt.lineStrong, borderRadius: ptRadius.sm, paddingHorizontal: 8 }}>
                      {split === 'fixed' ? <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>₦</Text> : null}
                      <TextInput
                        value={shares[a.id] ?? ''}
                        onChangeText={(t) => setShares((s) => ({ ...s, [a.id]: t.replace(/[^\d.]/g, '') }))}
                        keyboardType="decimal-pad"
                        accessibilityLabel={`${a.nickname} share`}
                        style={{ width: split === 'fixed' ? 76 : 36, paddingVertical: 6, fontFamily: ptFont.bold, fontSize: 15, color: pt.ink, textAlign: 'right' }}
                      />
                      {split === 'percent' ? <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>%</Text> : null}
                    </View>
                  )
                }
                last={i === g.accounts.length - 1}
              />
            ))}
          </PtPanel>

          <View style={{ gap: 10 }}>
            <PtGroupLabel>Default split</PtGroupLabel>
            <PtSegmented
              options={[
                { value: 'even', label: 'Evenly' },
                { value: 'percent', label: 'By %' },
                { value: 'fixed', label: 'Fixed amounts' },
              ]}
              value={split}
              onChange={setSplit}
            />
            {split === 'percent' && Math.round(total) !== 100 ? <PtNote tone="attention">{`The percentages add up to ${total}%. Make them 100%.`}</PtNote> : null}
            {split === 'fixed' ? <PtNote tone="info">{`${formatNaira(String(total))} in total each time.`}</PtNote> : null}
          </View>

          <PtButton title="Add to this group" variant="secondary" onPress={() => setAdding(true)} />
          <PtNote tone="info">Rules can pay a whole group at once. Change the split here and every rule using it updates.</PtNote>
          {error ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.danger }}>{error}</Text> : null}
        </>
      )}

      <PtSheet
        visible={adding}
        title="Accounts in this group"
        onClose={() => setAdding(false)}
        footer={
          <PtButton
            title="Save"
            disabled={picked.length < 2}
            loading={update.isPending}
            onPress={() => update.mutate({ saved_account_ids: picked }, { onSuccess: () => { notifySuccess(); setAdding(false); }, onError: (e) => setError(e.message) })}
          />
        }
      >
        <View style={{ gap: 2 }}>
          {(all.data?.accounts ?? []).map((a) => {
            const on = picked.includes(a.id);
            return (
              <PtRow
                key={a.id}
                title={a.nickname}
                subtitle={a.kind === 'patriai' ? 'Patriai' : `${a.bank_name} ${a.masked_number}`}
                left={<PtCheckbox checked={on} />}
                onPress={() => setPicked((p) => (on ? p.filter((x) => x !== a.id) : [...p, a.id]))}
              />
            );
          })}
        </View>
      </PtSheet>
    </PtPageScreen>
  );
}
