import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { colors, gradients, shadow } from '../../theme';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I create a new wallet?',
    a: "Go to Wallets → New, pick a type (shared, savings, goal, child, project…), name it and you're done.",
  },
  {
    q: 'How do I send money?',
    a: 'Open a wallet, tap Transfer, choose a wallet, a Patriai user, or a bank account, enter the amount and confirm with your PIN.',
  },
  {
    q: 'How do I fund a wallet?',
    a: 'Each wallet has a dedicated account number. Tap Fund to see it and transfer from any Nigerian bank — funds arrive instantly.',
  },
  {
    q: 'What are spending approvals?',
    a: 'On shared wallets you can require chosen members to approve withdrawals and transfers above a threshold before they go through.',
  },
  {
    q: 'How do family roles work?',
    a: 'Members can be Co-owner, Admin, Contributor or Viewer, and you can fine-tune View/Fund/Request/Withdraw per person under Wallet access.',
  },
  {
    q: 'What is Spousal Sync?',
    a: 'A two-person financial-transparency link. You each choose how much to share — minimal, selective or full — and either can pause or end it anytime.',
  },
  {
    q: 'What are Automations?',
    a: 'Smart rules that move money on a schedule — e.g. a monthly allowance from your main wallet to a child wallet.',
  },
  {
    q: 'How do I freeze a wallet?',
    a: "Open the wallet's Settings → Freeze & scheduled access. While frozen, no money can leave — even for you — but incoming funds still arrive.",
  },
  {
    q: 'How do KYC tiers work?',
    a: 'Verifying your identity (BVN, address, source of funds) raises your limits and unlocks more wallets. See Profile → Identity verification.',
  },
  {
    q: 'How do I raise a dispute?',
    a: 'Profile → Dispute Center → Raise a dispute. Add a reference if you have one so we can resolve it faster.',
  },
  {
    q: 'Is my money safe?',
    a: 'Balances are tracked to the kobo on an immutable ledger, PINs protect every spend, and you can enable biometric unlock.',
  },
];

export function HelpFaqScreen({ navigation }: RootScreenProps<'HelpFaq'>) {
  const [open, setOpen] = useState<Record<number, boolean>>({});

  const toggle = (index: number) => {
    selection();
    setOpen((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <Screen withBottomInset>
      <Header title="Help & FAQ" />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient
          colors={gradients.navy}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
        >
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
            <Ionicons name="help-buoy-outline" size={24} color={colors.white} />
          </View>
          <Text className="mt-4 text-2xl font-extrabold text-white">How can we help?</Text>
          <Text className="mt-1.5 text-[14px] leading-6 text-white/70">
            Answers to the questions people ask most.
          </Text>
        </LinearGradient>

        {/* Accordion */}
        {FAQS.map((item, index) => {
          const isOpen = !!open[index];
          return (
            <Card key={index} className="mt-3">
              <Pressable
                onPress={() => toggle(index)}
                className="flex-row items-center active:opacity-70"
              >
                <Text className="flex-1 pr-3 text-[15px] font-semibold text-ink">{item.q}</Text>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={colors.faded}
                />
              </Pressable>
              {isOpen ? (
                <Text className="mt-2 text-[14px] leading-6 text-muted">{item.a}</Text>
              ) : null}
            </Card>
          );
        })}

        {/* Footer */}
        <Card className="mt-7 items-center py-7">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-lav-faint">
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.navy} />
          </View>
          <Text className="mt-3 text-lg font-extrabold text-ink">Still need help?</Text>
          <Text className="mt-1 px-4 text-center text-[14px] leading-6 text-muted">
            Can't find your answer? Report a problem and our team will look into it.
          </Text>
          <View className="mt-5 w-full">
            <Button
              title="Report a problem"
              icon="alert-circle-outline"
              iconPosition="left"
              variant="secondary"
              onPress={() => navigation.navigate('Disputes')}
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
