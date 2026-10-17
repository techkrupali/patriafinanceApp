import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { colors, outline, radius } from '../../theme';
import { selection } from '../../lib/haptics';
import { walletVisual } from '../../lib/walletVisual';
import { WALLET_GUIDES, type WalletGuide } from '../../lib/walletGuides';
import type { RootScreenProps } from '../../navigation/types';

/**
 * Guided wallet creation, step one: pick the KIND of wallet. Client (2026-10-17):
 * "Let's NOT assume users would know how to use the app" — every type explains
 * what it is for, then opens its own setup journey with its own purposes.
 */
export function CreateWalletScreen({ navigation }: RootScreenProps<'CreateWallet'>) {
  const open = (guide: WalletGuide) => {
    selection();
    if (guide.type === 'emergency') {
      navigation.navigate('CreateEmergencyWallet');
    } else if (guide.type === 'project') {
      // A Project is an escrow project (vendor + milestones) with its own flow.
      navigation.navigate('CreateProject');
    } else {
      navigation.navigate('WalletSetup', { type: guide.type });
    }
  };

  return (
    <Screen withBottomInset>
      <Header title="Create Wallet" />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
        <Text className="text-[28px] font-extrabold leading-9 tracking-tight text-navy">Choose a Wallet Type</Text>
        <Text className="mt-2 text-[15px] leading-6 text-muted">
          Every wallet has its own purpose and rules. Pick the one that fits and we'll guide you through setting it
          up, step by step.
        </Text>

        <View className="mt-6" style={{ gap: 12 }}>
          {WALLET_GUIDES.map((guide) => {
            const v = walletVisual(guide.type);
            return (
              <Pressable
                key={guide.type}
                onPress={() => open(guide)}
                className="flex-row items-start rounded bg-white p-4 active:opacity-90"
                style={outline.card}
              >
                <LinearGradient
                  colors={v.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ width: 44, height: 44, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name={v.icon} size={20} color={v.onDark ? colors.white : colors.navy} />
                </LinearGradient>
                <View className="ml-3.5 flex-1 pr-2">
                  <Text className="text-[16px] font-bold text-ink">{guide.title}</Text>
                  <Text className="mt-0.5 text-[13px] leading-5 text-muted">{guide.tagline}</Text>
                  <Text className="mt-2 text-[12px] font-semibold text-brand">Good for: {guide.goodFor.join(' · ')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.faded} style={{ marginTop: 12 }} />
              </Pressable>
            );
          })}
        </View>

        <View className="mt-5 flex-row items-start rounded bg-success-soft p-4">
          <Ionicons name="bulb" size={17} color={colors.brand} style={{ marginRight: 10, marginTop: 1 }} />
          <Text className="flex-1 text-[12px] leading-5 text-brand-deep">
            Not sure? Start with a Savings wallet. You can create more wallets any time.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
