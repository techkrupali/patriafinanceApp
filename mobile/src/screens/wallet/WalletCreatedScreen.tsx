import React, { useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, Share, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtButton } from '../../components/pt/PtButton';
import { useFundingDetails, useWallet, useWallets } from '../../api/hooks';
import { joinNames } from '../../lib/goalPlan';
import { notifySuccess, selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** "9012234471" → "901 223 4471" */
const groupAccount = (n: string) => n.replace(/^(\d{3})(\d{3})(\d+)$/, '$1 $2 $3');

/** Gold tick inside two mint rings (WCR-12). */
function Done() {
  return (
    <View style={{ width: 132, height: 132, borderRadius: 66, borderWidth: 1.5, borderColor: pt.emerald100, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 104, height: 104, borderRadius: 52, borderWidth: 2.5, borderColor: pt.emerald300, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: pt.gold500, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="check" size={30} color="#2A1B00" />
        </View>
      </View>
    </View>
  );
}

/**
 * WCR-12 "School fees 2027 is ready": who was invited and, for a shared wallet,
 * its own account number to pay into from any bank — copy or share it.
 */
export function WalletCreatedScreen({ navigation, route }: RootScreenProps<'WalletCreated'>) {
  const { walletId, invited } = route.params;
  const insets = useSafeAreaInsets();
  const detail = useWallet(walletId);
  const wallets = useWallets();
  const wallet = detail.data?.wallet;
  const shared = wallet?.mode !== 'private';
  const funding = useFundingDetails(walletId, shared);
  const [copied, setCopied] = useState(false);

  const account = funding.data?.account_number ?? wallet?.virtual_account ?? null;
  const bank = funding.data?.bank_name ?? wallet?.virtual_account_bank ?? null;
  const accountName = funding.data?.account_name ?? null;

  const subtitle = !shared
    ? 'Move money in from your Main wallet whenever you like. Only you can see it.'
    : invited.length > 0
      ? `${joinNames(invited)} ${invited.length === 1 ? 'has' : 'have'} been invited. They can add money to this account from any bank.`
      : 'Anyone can add money to this account from any bank.';

  const details = account
    ? `Pay into ${wallet?.name ?? 'our wallet'} on Patriai\nAccount number: ${account}${bank ? `\nBank: ${bank}` : ''}${accountName ? `\nName: ${accountName}` : ''}`
    : '';

  const copy = async () => {
    if (!account) return;
    selection();
    await Clipboard.setStringAsync(account);
    notifySuccess();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const share = async () => {
    selection();
    const url = `whatsapp://send?text=${encodeURIComponent(details)}`;
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // Fall through to the system share sheet.
    }
    await Share.share({ message: details });
  };

  const addMoney = () => {
    if (shared) {
      navigation.replace('Fund', { walletId });
      return;
    }
    const main = wallets.data?.find((w) => w.type === 'main' && w.my_role === 'owner');
    navigation.replace('Transfer', { walletId: main?.id, toWalletId: walletId });
  };

  const row = (label: string, value: string | null) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 }}>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>{label}</Text>
      <Text style={{ flex: 1, textAlign: 'right', fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }} numberOfLines={2}>
        {value ?? '—'}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface, paddingTop: insets.top }}>
      <StatusBar style="dark" />
      {detail.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 120 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24, alignItems: 'center', gap: 20 }}>
          <Done />
          <View style={{ gap: 10, alignItems: 'center' }}>
            <Text
              style={{ fontFamily: ptFont.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.7, color: pt.ink, textAlign: 'center' }}
              accessibilityRole="header"
            >
              {wallet?.name ?? 'Your wallet'} is ready
            </Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted, textAlign: 'center' }}>{subtitle}</Text>
          </View>

          {shared ? (
            <View style={{ alignSelf: 'stretch', backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 20, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.inkMuted }}>Wallet account number</Text>
                  {account ? (
                    <Text style={{ fontFamily: MONO, fontWeight: '700', fontSize: 22, letterSpacing: 1, color: pt.ink }} selectable>
                      {groupAccount(account)}
                    </Text>
                  ) : funding.isLoading ? (
                    <ActivityIndicator color={pt.brand} style={{ alignSelf: 'flex-start', marginVertical: 6 }} />
                  ) : (
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>Being set up. It shows on the wallet in a moment.</Text>
                  )}
                </View>
                {account ? (
                  <Pressable
                    onPress={() => void copy()}
                    accessibilityRole="button"
                    accessibilityLabel="Copy account number"
                    style={{ height: 40, paddingHorizontal: 16, borderRadius: ptRadius.sm, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>{copied ? 'Copied' : 'Copy'}</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={{ height: 1, backgroundColor: pt.line, marginVertical: 4 }} />
              {row('Bank', bank)}
              {row('Name', accountName)}
            </View>
          ) : null}
        </ScrollView>
      )}

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 10, gap: 10 }}>
        <PtButton title="Add money now" onPress={addMoney} />
        {shared && account ? <PtButton title="Share details on WhatsApp" variant="secondary" onPress={() => void share()} /> : null}
        <PtButton title="Go to wallet" variant="ghost" onPress={() => navigation.replace('WalletDetail', { walletId })} />
      </View>
    </View>
  );
}
