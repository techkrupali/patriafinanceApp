import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtPanel, PtPills, PtReviewRow, PtChoiceCard } from '../../components/pt/PtForm';
import { PtRow, PtIconTile } from '../../components/pt/PtList';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtSheet } from '../../components/pt/PtSheet';
import { LoadError } from '../../components/LoadError';
import { HeaderIcon } from '../../components/wallet/WalletManageUi';
import { useSavedAccounts } from '../../api/hooks';
import { useRemoveSavedAccount, useSavedAccountDetail, useUpdateSavedAccount } from '../../api/payments';
import { initialsOf, useSendDraft } from '../../store/sendDraft';
import { PAYEE_CATEGORIES } from './SendBankScreen';
import { savedSub } from './SendRecipientScreen';
import { formatNaira } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Sun 1 Nov" */
const day = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * BEN-03 Saved account: the name the bank has, what was paid this year, the
 * next payment, its group, the rules that pay it — then Send money. The pencil
 * edits the nickname and category; BEN-05 removes it and pauses or deletes
 * the rules that paid it.
 */
export function SavedAccountDetailScreen({ navigation, route }: RootScreenProps<'SavedAccountDetail'>) {
  const id = route.params.id;
  const q = useSavedAccountDetail(id);
  const all = useSavedAccounts();
  const update = useUpdateSavedAccount(id);
  const remove = useRemoveSavedAccount(id);
  const setRecipient = useSendDraft((s) => s.setRecipient);
  const start = useSendDraft((s) => s.start);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [nickname, setNickname] = useState('');
  const [category, setCategory] = useState('family');
  const [ruleChoice, setRuleChoice] = useState<'pause' | 'delete'>('pause');
  const [error, setError] = useState<string | null>(null);

  const d = q.data;
  const a = d?.account;
  const groupId = a?.groups[0] ? all.data?.groups.find((g) => g.name === a.groups[0])?.id : undefined;
  const year = new Date().getFullYear();

  const send = () => {
    if (!a) return;
    start();
    setRecipient(
      a.kind === 'patriai'
        ? { kind: 'user', name: a.nickname, identifier: a.payee?.username ? `@${a.payee.username}` : '', sub: savedSub(a), savedId: a.id, avatarUrl: a.payee?.avatar_url }
        : { kind: 'bank', name: a.nickname, bankCode: a.bank_code ?? '', bankName: a.bank_name ?? '', accountNumber: a.account_number ?? '', sub: savedSub(a), savedId: a.id, verified: a.verified, saved: true },
    );
    navigation.navigate('SendAmount');
  };

  return (
    <PtPageScreen
      title={a?.nickname ?? 'Saved account'}
      subtitle={a ? `${cap(a.category)}${a.verified ? ' · verified' : ''}` : null}
      onBack={() => navigation.goBack()}
      right={
        a ? (
          <HeaderIcon
            icon="edit-2"
            label="Edit saved account"
            onPress={() => {
              setNickname(a.nickname);
              setCategory(a.category);
              setError(null);
              setEditing(true);
            }}
          />
        ) : undefined
      }
      footer={a ? <PtButton title="Send money" onPress={send} /> : undefined}
    >
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !d || !a ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <PtAvatar initials={initialsOf(a.nickname)} size={56} tone="deep" uri={a.payee?.avatar_url} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{a.account_name}</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>
                {a.kind === 'patriai' ? `Patriai${a.payee?.username ? ` · @${a.payee.username}` : ''}` : `${a.bank_name} · ${(a.account_number ?? '').slice(0, 4)} •••• ${(a.account_number ?? '').slice(-2)}`}
              </Text>
            </View>
          </View>

          <PtPanel>
            <PtReviewRow label={`Paid in ${year}`} value={formatNaira(d.paid_this_year)} sub={`${d.payments_this_year} payment${d.payments_this_year === 1 ? '' : 's'}`} />
            <PtReviewRow
              label="Next payment"
              value={d.next_payment ? `${day(d.next_payment.on)} · ${formatNaira(d.next_payment.amount)}` : 'None planned'}
              sub={d.next_payment?.label ?? null}
              last={!a.groups.length}
            />
            {a.groups.length ? <PtReviewRow label="Group" value={a.groups.join(', ')} onEdit={groupId ? () => navigation.navigate('SavedGroup', { id: groupId }) : undefined} last /> : null}
          </PtPanel>

          {d.rules.length ? (
            <View style={{ gap: 10 }}>
              <PtGroupLabel>Rules that pay this account</PtGroupLabel>
              <PtPanel>
                {d.rules.map((r, i) => (
                  <PtRow
                    key={r.id}
                    title={r.label}
                    subtitle={`${r.when} · ${formatNaira(r.amount)}${r.enabled ? '' : ' · paused'}${r.wallet ? ` · from ${r.wallet}` : ''}`}
                    left={
                      <PtIconTile>
                        <Feather name="repeat" size={17} color={pt.brand} />
                      </PtIconTile>
                    }
                    last={i === d.rules.length - 1}
                  />
                ))}
              </PtPanel>
            </View>
          ) : null}
        </>
      )}

      <PtSheet
        visible={editing}
        title="Edit saved account"
        onClose={() => setEditing(false)}
        footer={
          <View style={{ gap: 4 }}>
            <PtButton
              title="Save"
              loading={update.isPending}
              onPress={() => update.mutate({ nickname: nickname.trim(), category }, { onSuccess: () => { notifySuccess(); setEditing(false); }, onError: (e) => setError(e.message) })}
            />
            <PtButton title="Remove saved account" variant="ghost" onPress={() => { setEditing(false); setRemoving(true); }} />
          </View>
        }
      >
        <View style={{ gap: 12 }}>
          <PtField label="Nickname" value={nickname} onChangeText={setNickname} maxLength={80} />
          <PtPills compact options={PAYEE_CATEGORIES.some((c) => c.value === category) ? PAYEE_CATEGORIES : [...PAYEE_CATEGORIES, { value: category, label: cap(category) }]} value={category} onChange={setCategory} />
          {error ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.danger }}>{error}</Text> : null}
        </View>
      </PtSheet>

      <PtSheet
        visible={removing}
        title={`Remove ${a?.nickname ?? 'this account'}?`}
        subtitle={d?.rules.length ? `${d.rules.length} rule${d.rules.length === 1 ? ' pays' : 's pay'} this account.` : 'It will leave your saved accounts and groups.'}
        onClose={() => setRemoving(false)}
        footer={
          <View style={{ gap: 4 }}>
            <PtButton
              title="Remove saved account"
              style={{ backgroundColor: pt.danger }}
              loading={remove.isPending}
              onPress={() =>
                remove.mutate(d?.rules.length ? { rules: ruleChoice } : {}, {
                  onSuccess: () => {
                    notifySuccess();
                    setRemoving(false);
                    navigation.goBack();
                  },
                  onError: (e) => setError(e.message),
                })
              }
            />
            <PtButton title="Cancel" variant="ghost" onPress={() => setRemoving(false)} />
          </View>
        }
      >
        {d?.rules.length ? (
          <View style={{ gap: 10 }}>
            <PtPanel>
              {d.rules.map((r, i) => (
                <PtReviewRow key={r.id} label="Rule affected" value={`${r.label} · ${formatNaira(r.amount)}`} sub={d.next_payment && i === 0 ? `Next on ${day(d.next_payment.on)}` : r.when} last={i === d.rules.length - 1} />
              ))}
            </PtPanel>
            <PtChoiceCard icon="pause" title="Pause the rule too" subtitle="You can pick a new account later" selected={ruleChoice === 'pause'} onPress={() => { selection(); setRuleChoice('pause'); }} />
            <PtChoiceCard icon="trash-2" title="Delete the rule too" selected={ruleChoice === 'delete'} onPress={() => { selection(); setRuleChoice('delete'); }} />
          </View>
        ) : null}
        {error && removing ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.danger }}>{error}</Text> : null}
      </PtSheet>
    </PtPageScreen>
  );
}
