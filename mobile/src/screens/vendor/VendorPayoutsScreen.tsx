import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useSetAutoWithdraw, useVendorHome, useVendorPayouts } from '../../api/projectFlow';
import { PtTabScreen } from '../../components/pt/PtTabScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtPanel, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { PtSectionTitle } from '../../components/pt/PtList';
import { PtSheet } from '../../components/pt/PtSheet';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatMoney, formatNaira } from '../../lib/format';
import { dayMonth } from '../../lib/projects';
import type { VendorTabScreenProps } from '../../navigation/types';
import { showAlert } from '../../lib/alert';

/** VDM-06 Payouts: what can be withdrawn, what's held back, the business account and automatic withdrawal. */
export function VendorPayoutsScreen({ navigation }: VendorTabScreenProps<'VendorPayouts'>) {
  const query = useVendorPayouts();
  const home = useVendorHome();
  const setAuto = useSetAutoWithdraw();
  const [autoOpen, setAutoOpen] = useState(false);
  const p = query.data;
  const owner = home.data?.team_role === 'owner';

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
          {owner && p.wallet_id && Number(p.available) > 0 ? (
            <PtButton title={`Withdraw ${formatNaira(p.available)}`} onPress={() => navigation.navigate('Withdraw', { walletId: p.wallet_id! })} />
          ) : null}
        </>
      )}

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
