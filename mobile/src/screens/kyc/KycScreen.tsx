import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtNote } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { useKyc } from '../../api/hooks';
import { useLimits } from '../../api/account';
import { formatNaira } from '../../lib/format';
import { showAlert } from '../../lib/alert';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

const WALLETS: Record<number, string> = {
  1: '1 wallet',
  2: 'Up to 3 wallets, shared wallets',
  3: 'Up to 20 wallets, vendor payments over ₦1m',
};

/**
 * ME-23 Account level: your verification tier and plan, then each tier — what
 * it needs, what you can send a day and hold — with "You are here" and Next.
 */
export function KycScreen({ navigation }: RootScreenProps<'Kyc'>) {
  const kyc = useKyc();
  const limits = useLimits();
  const tier = kyc.data?.tier ?? 0;
  const pending = kyc.data?.pending_submission;
  const rejected = kyc.data?.last_rejected;
  const next = tier < 3 ? (tier === 0 ? 1 : tier + 1) : null;

  return (
    <PtPageScreen
      title="Account level"
      subtitle="Verification tier and plan"
      onBack={() => navigation.goBack()}
      footer={
        next ? (
          <PtButton
            title={pending ? `Tier ${pending.target_tier} is being checked` : `Upgrade to Tier ${next}`}
            disabled={Boolean(pending)}
            onPress={() => navigation.navigate('KycSubmit', { targetTier: next })}
          />
        ) : undefined
      }
    >
      {kyc.isLoading || limits.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !kyc.data || !limits.data ? (
        <LoadError message={((kyc.error ?? limits.error) as Error | null)?.message} onRetry={() => { void kyc.refetch(); void limits.refetch(); }} />
      ) : (
        <>
          <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.md, padding: 16, flexDirection: 'row' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: ptFont.medium, fontSize: 12, color: pt.onDarkMuted }}>Verification</Text>
              <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, color: '#FFFFFF' }}>{tier === 0 ? 'Phone only' : `Tier ${tier}`}</Text>
            </View>
            <Pressable
              onPress={() => {
                selection();
                showAlert('Plans are coming', 'Free is the plan for everyone for now. Pro, with more wallets and rules, comes later.');
              }}
              accessibilityRole="button"
              style={{ flex: 1, gap: 2 }}
            >
              <Text style={{ fontFamily: ptFont.medium, fontSize: 12, color: pt.onDarkMuted }}>Plan · compare</Text>
              <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, color: '#FFFFFF' }}>Free ›</Text>
            </Pressable>
          </View>

          {pending ? <PtNote tone="info" icon="clock">{`Tier ${pending.target_tier} is with our team. It usually takes under a day; we'll tell you.`}</PtNote> : null}
          {!pending && rejected ? <PtNote tone="attention">{`Tier ${rejected.target_tier} wasn't approved${rejected.review_note ? `: ${rejected.review_note}` : '.'} Try again.`}</PtNote> : null}

          {limits.data.tiers.map((t) => {
            const here = t.tier === Math.max(1, tier) && tier > 0;
            const done = t.tier < tier || (t.tier === tier && tier > 0 && !here);
            const isNext = t.tier === next;
            return (
              <View
                key={t.tier}
                style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 10, borderWidth: here ? 2 : 0, borderColor: pt.brand }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>Tier {t.tier}</Text>
                  {here ? <PtChip label="You are here" tone="brand" icon="circle" /> : t.tier < tier || done ? <PtChip label="Done" tone="success" icon="check" /> : isNext ? <PtChip label="Next" tone="neutral" icon="arrow-right" /> : null}
                </View>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Needs: {t.needs}</Text>
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 11, letterSpacing: 0.6, color: pt.inkMuted }}>SEND A DAY</Text>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(t.daily)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 11, letterSpacing: 0.6, color: pt.inkMuted }}>BALANCE</Text>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{t.max_balance ? formatNaira(t.max_balance) : 'No limit'}</Text>
                  </View>
                </View>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{WALLETS[t.tier]}</Text>
              </View>
            );
          })}
        </>
      )}
    </PtPageScreen>
  );
}
