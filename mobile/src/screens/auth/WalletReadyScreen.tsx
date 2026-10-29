import React, { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';
import { LogoMark } from '../../components/pt/PtLogo';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { useFundingDetails, useWallets } from '../../api/hooks';
import { useAuth, type PostOnboardingRoute } from '../../store/auth';
import { useOnboardingCopy } from '../../lib/onboardingCopy';
import { notifySuccess, selection } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** "9012345678" → "901 234 5678" */
function groupAccount(n: string): string {
  return n.length === 10 ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : n;
}

/**
 * ONB-12 "Your main wallet is ready": the main wallet's own account number,
 * bank and name, next steps, and Go to home. Reading the funding details also
 * retries the virtual account if the bank was slow at sign-up.
 */
export function WalletReadyScreen({ navigation }: AuthScreenProps<'WalletReady'>) {
  const copy = useOnboardingCopy();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const finishOnboarding = useAuth((s) => s.finishOnboarding);
  const wallets = useWallets();
  const main = wallets.data?.find((w) => w.type === 'main');
  const funding = useFundingDetails(main?.id ?? 0, Boolean(main));
  const [copied, setCopied] = useState(false);

  const accountNumber = funding.data?.account_number || main?.virtual_account || null;
  const bank = funding.data?.bank_name || main?.virtual_account_bank || '';
  const loading = wallets.isLoading || (Boolean(main) && funding.isLoading && !main?.virtual_account);

  const copyNumber = async () => {
    if (!accountNumber) return;
    await Clipboard.setStringAsync(accountNumber);
    notifySuccess();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const steps: { label: string; route: PostOnboardingRoute }[] = [
    { label: copy.ready.verifyBvn, route: 'Kyc' },
    { label: copy.ready.inviteFamily, route: 'FamilyHub' },
    { label: copy.ready.firstWallet, route: 'CreateWallet' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, alignItems: 'center', gap: 16 }}>
          <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 60, borderWidth: 2, borderColor: pt.emerald100 }} />
            <View style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, borderRadius: 44, borderWidth: 2, borderColor: pt.emerald300 }} />
            <LogoMark size={64} />
          </View>
          <PtText variant="headline" style={{ textAlign: 'center' }} accessibilityRole="header">
            {copy.ready.title}
          </PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 300 }}>
            {copy.ready.subtitle}
          </PtText>
        </View>

        <View
          style={{
            marginTop: 24,
            marginHorizontal: 20,
            backgroundColor: pt.raised,
            borderRadius: ptRadius.md,
            paddingVertical: 18,
            paddingHorizontal: 20,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ gap: 2, flex: 1 }}>
              <PtText variant="caption" color={pt.inkMuted}>
                {copy.ready.accountNumber}
              </PtText>
              {loading ? (
                <ActivityIndicator color={pt.brand} style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
              ) : accountNumber ? (
                <Text style={{ fontFamily: MONO, fontSize: 22, fontWeight: '600', letterSpacing: 0.88, color: pt.ink }}>
                  {groupAccount(accountNumber)}
                </Text>
              ) : (
                <PtText variant="caption" color={pt.inkMuted}>
                  {copy.ready.pending}
                </PtText>
              )}
            </View>
            {accountNumber ? (
              <PtButton
                title={copied ? copy.ready.copied : copy.ready.copy}
                variant="secondary"
                size="sm"
                onPress={() => void copyNumber()}
              />
            ) : null}
          </View>
          <View style={{ height: 1, backgroundColor: pt.line }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <PtText color={pt.inkMuted} style={{ fontSize: 14, lineHeight: 20 }}>
              {copy.ready.bank}
            </PtText>
            <PtText style={{ fontFamily: ptFont.bold, fontSize: 14, lineHeight: 20, flexShrink: 1, textAlign: 'right' }}>
              {bank}
            </PtText>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <PtText color={pt.inkMuted} style={{ fontSize: 14, lineHeight: 20 }}>
              {copy.ready.name}
            </PtText>
            <PtText style={{ fontFamily: ptFont.bold, fontSize: 14, lineHeight: 20, flexShrink: 1, textAlign: 'right' }}>
              {user?.full_name ?? ''}
            </PtText>
          </View>
        </View>

        <View style={{ marginTop: 20, marginHorizontal: 20, gap: 4 }}>
          <PtText variant="overline" color={pt.inkMuted} style={{ marginBottom: 6 }}>
            {copy.ready.nextSteps}
          </PtText>
          {steps.map((s) => (
            <Pressable
              key={s.route}
              onPress={() => {
                selection();
                finishOnboarding(s.route);
              }}
              accessibilityRole="button"
              style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: pt.lineStrong }} />
              <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 18 }}>
        <PtButton title={copy.ready.goHome} onPress={() => navigation.navigate('NextSteps')} />
      </View>
    </View>
  );
}
