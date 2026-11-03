import React from 'react';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { useAuth } from '../../store/auth';
import type { RootScreenProps } from '../../navigation/types';

/**
 * INV-K2 "Verify to become a keyholder · Tier 2 needed": BVN, NIN, a selfie.
 * "Until you finish, you can see the fund and save into it, but you can't
 * approve releases."
 */
export function KeyholderVerifyScreen({ navigation, route }: RootScreenProps<'KeyholderVerify'>) {
  const tier = useAuth((s) => s.user?.kyc_tier ?? 0);
  const step = (done: boolean, next: boolean) => (done ? 'Done' : next ? 'Next' : 'Then');

  return (
    <PtPageScreen
      title="Verify to become a keyholder"
      onBack={() => navigation.goBack()}
      footer={
        <>
          <PtButton title={tier >= 1 ? 'Continue with NIN' : 'Continue with BVN'} onPress={() => navigation.navigate('Kyc')} />
          <PtButton title="Later" variant="ghost" onPress={() => navigation.replace('KeyholderDone', { walletId: route.params.walletId })} />
        </>
      }
    >
      <PtChip label="Tier 2 needed" tone="warning" icon="lock" />
      <PtPanel>
        <PtReviewRow label="BVN" value={step(tier >= 1, tier < 1)} />
        <PtReviewRow label="NIN" value={step(tier >= 2, tier === 1)} />
        <PtReviewRow label="Selfie" value={tier >= 2 ? 'Done' : 'To match your ID'} last />
      </PtPanel>
      <PtNote>Until you finish, you can see the fund and save into it, but you can't approve releases.</PtNote>
    </PtPageScreen>
  );
}
