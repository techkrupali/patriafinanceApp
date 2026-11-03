import React from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { DoneHero, LoadingBlock } from '../../components/project/ProjectUi';
import { useWallet } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

/** INV-K3 "You're a keyholder" — the fund, how you hear about requests, and what's next. */
export function KeyholderDoneScreen({ navigation, route }: RootScreenProps<'KeyholderDone'>) {
  const { walletId } = route.params;
  const me = useAuth((s) => s.user);
  const q = useWallet(walletId);
  const w = q.data?.wallet;
  const tier = me?.kyc_tier ?? 0;

  return (
    <PtPageScreen
      title=""
      onBack={() => navigation.popToTop()}
      footer={
        <>
          <PtButton title="See the fund" onPress={() => navigation.replace('WalletDetail', { walletId })} />
          <PtButton title="Done" variant="ghost" onPress={() => navigation.popToTop()} />
        </>
      }
    >
      {!w ? (
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: 12, paddingTop: 12 }}>
            <DoneHero />
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 26, color: pt.ink, textAlign: 'center' }} accessibilityRole="header">{"You're a keyholder"}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.inkMuted, textAlign: 'center' }}>
              {`${me?.first_name ?? 'You'}, you're now one of the keyholders. We'll notify you straight away if money is needed.`}
            </Text>
          </View>
          <PtPanel>
            <PtReviewRow label="Fund" value={w.name} sub={w.target_amount ? `${formatNaira(w.balance)} of ${formatNaira(w.target_amount)}` : formatNaira(w.balance)} />
            <PtReviewRow label="Alerts" value="Push and SMS" sub="For release requests only" last />
          </PtPanel>
          {tier < 2 ? <PtNote tone="attention">Verify your NIN and a selfie (Tier 2) to approve releases. You can see the fund and save into it now.</PtNote> : null}
        </>
      )}
    </PtPageScreen>
  );
}
