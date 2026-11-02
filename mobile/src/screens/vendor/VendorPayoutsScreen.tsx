import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useSetAutoWithdraw, useVendorHome, useVendorPayouts, useVendorWithdraw } from '../../api/projectFlow';
import { ApiError } from '../../api/client';
import { PtTabScreen } from '../../components/pt/PtTabScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtPanel, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { PtSectionTitle } from '../../components/pt/PtList';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtField } from '../../components/pt/PtField';
import { PinSheet } from '../../components/PinSheet';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatMoney, formatNaira, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { dayMonth } from '../../lib/projects';
import type { VendorTabScreenProps } from '../../navigation/types';
import { showAlert } from '../../lib/alert';

/** VDM-06 Payouts: what can be withdrawn, what's held back, the business account and automatic withdrawal. */
export function VendorPayoutsScreen({ navigation }: VendorTabScreenProps<'VendorPayouts'>) {
  const query = useVendorPayouts();
  const home = useVendorHome();
  const setAuto = useSetAutoWithdraw();
  const withdraw = useVendorWithdraw();
  const [autoOpen, setAutoOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const p = query.data;
  const owner = home.data?.team_role === 'owner';
  // The ₦20 bank fee comes out of the balance too, so the most that can go out is a little under it.
  const most = p ? Math.max(0, Number(p.available) - Number(p.fee)) : 0;
  const to = p?.account ? `${p.account.name ?? 'Business account'} · ${p.account.bank_name ?? 'Bank'} •••• ${p.account.last4}` : '';

  const openWithdraw = () => {
    setAmount(String(most));
    setOutOpen(true);
  };
  const send = (pin: string) => {
    setPinError(null);
    withdraw.mutate(
      { amount, pin },
      {
        onSuccess: () => {
          notifySuccess();
          setPinOpen(false);
          setOutOpen(false);
          showAlert('On its way', `${formatNaira(amount)} is going to ${to}.`);
        },
        onError: (e) => {
          const err = e as ApiError;
          if (err.errors?.pin) setPinError(err.errors.pin[0]);
          else {
            setPinOpen(false);
            showAlert('Not sent', err.message);
          }
        },
      },
    );
  };

  return (
    <PtTabScreen title="Payouts" refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      {!p ? (
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 20, gap: 6 }}>
            <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.onDarkMuted }}>Available to withdraw</Text>
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 32, letterSpacing: -0.8, color: '#FFFFFF' }} adjustsFontSizeToFit numberOfLines={1}>
              {formatMoney(p.available)}
            </Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.onDarkMuted }}>
              {Number(p.held_back) > 0 ? `${formatNaira(p.held_back)} held back across ${p.held_back_projects} project${p.held_back_projects === 1 ? '' : 's'}` : 'Nothing held back right now'}
            </Text>
          </View>
          <PtPanel>
            <PtReviewRow
              label="Withdraw to"
              value={p.account ? `Business account •••• ${p.account.last4}` : 'No business account yet'}
              sub={p.account ? `${p.account.name ?? ''}${p.account.bank_name ? ` · ${p.account.bank_name}` : ''}` : 'Add it in your business account'}
              onEdit={owner ? () => navigation.navigate('BusinessSetup', { step: 7 }) : undefined}
            />
            <PtReviewRow
              label="Automatic withdrawal"
              value={p.auto_withdraw ? 'Every payout, straight away' : 'Off · withdraw by hand'}
              sub={!p.can_be_paid ? 'Starts once your business is verified' : null}
              onEdit={owner ? () => setAutoOpen(true) : undefined}
              last
            />
          </PtPanel>
          <PtSectionTitle title="Recent" />
          {p.recent.length === 0 ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>Payouts from families show here once a milestone is approved.</Text>
          ) : (
            <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
              {p.recent.map((r, i) => {
                const credit = r.direction === 'credit';
                return (
                  <View key={r.id} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === p.recent.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: credit ? pt.brandSoft : pt.sunken, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={credit ? 'arrow-down-left' : 'arrow-up-right'} size={18} color={credit ? pt.brand : pt.inkMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={2}>{r.title}</Text>
                      <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{dayMonth(r.date)}{r.kind === 'retention' ? ' · held-back money' : ''}{r.status === 'pending' ? ' · processing' : ''}</Text>
                    </View>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: credit ? pt.brand : pt.ink }}>{credit ? '+' : '−'}{formatNaira(r.amount).replace('−', '')}</Text>
                  </View>
                );
              })}
            </View>
          )}
          {owner && p.account && p.can_be_paid && most > 0 ? <PtButton title={`Withdraw ${formatNaira(most)}`} onPress={openWithdraw} /> : null}
        </>
      )}

      <PtSheet
        visible={outOpen}
        title="Withdraw"
        subtitle="Payouts only go to your verified business account."
        onClose={() => setOutOpen(false)}
        footer={<PtButton title={`Withdraw ${formatNaira(amount || 0)}`} disabled={!Number(amount) || Number(amount) > most} onPress={() => setPinOpen(true)} />}
      >
        <PtField label="Amount" prefix="₦" value={groupAmountInput(amount)} onChangeText={(t) => setAmount(sanitizeAmountInput(t))} keyboardType="decimal-pad" placeholder="0" />
        <PtPanel>
          <PtReviewRow label="To" value={p?.account ? `${p.account.name ?? 'Business account'}` : '—'} sub={p?.account ? `${p.account.bank_name ?? 'Bank'} •••• ${p.account.last4}` : null} />
          <PtReviewRow label="Fee" value={formatNaira(p?.fee ?? 0)} sub={Number(amount) > most ? `You can withdraw up to ${formatNaira(most)}` : null} last />
        </PtPanel>
      </PtSheet>
      <PinSheet visible={pinOpen} title="Withdraw" subtitle="To your business account" amount={formatNaira(amount || 0)} recipient={p?.account?.name ?? undefined} loading={withdraw.isPending} error={pinError} onSubmit={send} onClose={() => setPinOpen(false)} />

      <PtSheet visible={autoOpen} title="Automatic withdrawal" subtitle="Every payout goes straight to your business account." onClose={() => setAutoOpen(false)}>
        <PtSwitchRow
          title="Every payout, straight away"
          subtitle="Turn off to keep payouts in your Patriai balance and withdraw by hand."
          value={Boolean(p?.auto_withdraw)}
          onChange={(v) => setAuto.mutate(v, { onError: (e) => showAlert('Could not save', (e as Error).message) })}
        />
      </PtSheet>
    </PtTabScreen>
  );
}
