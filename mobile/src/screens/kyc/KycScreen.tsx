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

/** "Up to 3 wallets, shared wallets" from the tier's own numbers. */
const walletsLine = (t: { max_wallets: number; shared_wallets: boolean }) =>
  `${t.max_wallets === 1 ? '1 wallet' : `Up to ${t.max_wallets} wallets`}${t.shared_wallets ? ', shared wallets' : ''}`;

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
  // The tiers come from admin Settings; the next one is the first above yours.
  const levels = (limits.data?.tiers ?? []).map((t) => t.tier);
  const next = tier === 0 ? 1 : levels.find((l) => l > tier) ?? null;
  const nameOf = (level: number) => limits.data?.tiers.find((t) => t.tier === level)?.name ?? `Tier ${level}`;

  return (
    <PtPageScreen
      title="Account level"
      subtitle="Verification tier and plan"
      onBack={() => navigation.goBack()}
      footer={
        next ? (
          <PtButton
            title={pending ? `${nameOf(pending.target_tier)} is being checked` : `Upgrade to ${nameOf(next)}`}
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
              <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, color: '#FFFFFF' }} numberOfLines={1}>{tier === 0 ? 'Phone only' : nameOf(tier)}</Text>
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

          {pending ? <PtNote tone="info" icon="clock">{`${nameOf(pending.target_tier)} is with our team. It usually takes under a day; we'll tell you.`}</PtNote> : null}
          {!pending && rejected ? <PtNote tone="attention">{`${nameOf(rejected.target_tier)} wasn't approved${rejected.review_note ? `: ${rejected.review_note}` : '.'} Try again.`}</PtNote> : null}

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
                  <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }} numberOfLines={1}>{t.name ?? `Tier ${t.tier}`}</Text>
                  {here ? <PtChip label="You are here" tone="brand" icon="circle" /> : t.tier < tier || done ? <PtChip label="Done" tone="success" icon="check" /> : isNext ? <PtChip label="Next" tone="neutral" icon="arrow-right" /> : null}
                </View>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Needs: {t.needs}</Text>
                {t.description ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{t.description}</Text> : null}
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 11, letterSpacing: 0.6, color: pt.inkMuted }}>SEND A DAY</Text>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{t.daily ? formatNaira(t.daily) : 'No limit'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 11, letterSpacing: 0.6, color: pt.inkMuted }}>BALANCE</Text>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{t.max_balance ? formatNaira(t.max_balance) : 'No limit'}</Text>
                  </View>
                </View>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{walletsLine(t)}</Text>
              </View>
            );
          })}
        </>
      )}
    </PtPageScreen>
  );
}
