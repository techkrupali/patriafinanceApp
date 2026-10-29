import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { useLimits } from '../../api/account';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

/** What the next tier asks for, in a few words (KYC-03/07/08). */
const HOW: Record<number, string> = {
  1: 'Add your BVN. Takes about 2 minutes.',
  2: 'Add your NIN and a selfie. Takes about 3 minutes.',
  3: 'Add an ID document and proof of address. Takes about 5 minutes.',
};

/**
 * ME-11 My limits: send per day and what's left today, one payment, how much
 * you can hold (and what Main has), receiving, and the next tier.
 */
export function MyLimitsScreen({ navigation }: RootScreenProps<'MyLimits'>) {
  const q = useLimits();
  const l = q.data;
  // Tier 0 (phone only) has Tier 1's limits; its next step is still the BVN (Tier 1).
  const phoneOnly = (l?.tier ?? 0) < 1;

  return (
    <PtPageScreen
      title="My limits"
      subtitle={l ? `Tier ${l.tier} · ${phoneOnly ? 'phone only' : 'verified'}` : null}
      onBack={() => navigation.goBack()}
      footer={
        l?.next ? (
          <View style={{ gap: 4 }}>
            <PtButton
              title={l.pending_tier ? `Tier ${l.pending_tier} is being checked` : phoneOnly ? 'Verify your BVN' : `Go to Tier ${l.next.tier}`}
              disabled={Boolean(l.pending_tier)}
              onPress={() => navigation.navigate('KycSubmit', { targetTier: phoneOnly ? 1 : l.next!.tier })}
            />
            <PtButton title="Compare all tiers" variant="ghost" onPress={() => navigation.navigate('Kyc')} />
          </View>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !l ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <PtPanel>
            <PtReviewRow label="Send per day" value={formatNaira(l.daily)} sub={`${formatNaira(l.left_today)} left today`} />
            <PtReviewRow label="Single payment" value={formatNaira(l.single)} />
            <PtReviewRow label="Balance" value={l.max_balance ? `Up to ${formatNaira(l.max_balance)}` : 'No limit'} sub={`Main has ${formatNaira(l.main_balance)}`} />
            <PtReviewRow label="Receive" value="No limit" />
            <PtReviewRow label="Wallets" value={`${l.wallets} of ${l.max_wallets}`} sub={l.shared_wallets ? 'Shared wallets on' : 'Shared wallets from Tier 2'} last />
          </PtPanel>
          {l.next ? (
            <View style={{ backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, padding: 16, gap: 4 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>
                Tier {l.next.tier}: up to {formatNaira(l.next.daily)} a day
              </Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{phoneOnly ? 'First your BVN (Tier 1, about 2 minutes), then your NIN and a selfie.' : HOW[l.next.tier]}</Text>
            </View>
          ) : (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>You're on the highest tier.</Text>
          )}
        </>
      )}
    </PtPageScreen>
  );
}
