import React, { useRef, useState } from 'react';
import { Dimensions, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { colors, gradients, shadow } from '../../theme';
import { STORAGE_KEYS } from '../../config';
import { selection } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const { width: SCREEN_W } = Dimensions.get('window');

/** On-gold content colour (Curated Ledger on-primary-container). */
const ON_GOLD = '#3D2F00';
/** Metallic gold container fill (primary-container). */
const GOLD_CONTAINER = '#FFCC00';
/** Deep completion check colour (design on-primary-fixed). */
const ON_GOLD_FIXED = '#241A00';

type Slide =
  | { kind: 'feature'; key: string; icon: IconName; title: string; body: string; chips?: string[] }
  | { kind: 'steward'; key: string }
  | { kind: 'done'; key: string };

const SLIDES: Slide[] = [
  {
    kind: 'feature',
    key: 'wallet',
    icon: 'wallet',
    title: 'A wallet for everything',
    body: 'Child allowances, shared family funds, savings goals and project escrows — each with its own account number anyone can pay into.',
  },
  {
    kind: 'feature',
    key: 'together',
    icon: 'people',
    title: 'Control stays with you',
    body: 'Invite family with roles and fine-grained permissions. Big spends can require approval — and kids can request money instead of taking it.',
    chips: ['View', 'Spend', 'Approve'],
  },
  {
    kind: 'feature',
    key: 'autopilot',
    icon: 'flash',
    title: 'Put it on autopilot',
    body: 'Automations move allowances and savings on a schedule, goals track your progress, and every change is written to an audit log.',
  },
  {
    kind: 'feature',
    key: 'safety',
    icon: 'shield-checkmark',
    title: 'Safe by design',
    body: 'PIN on every spend, biometric unlock, wallet freezing and spend windows. Your family’s money, protected.',
  },
  { kind: 'steward', key: 'steward' },
  { kind: 'done', key: 'done' },
];

const STEWARD_POINTS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'bulb-outline', title: 'Smart Guidance', body: 'Suggestions on how to save, spend and plan better.' },
  { icon: 'stats-chart-outline', title: 'Automated Insights', body: 'Steward watches your finances and highlights what matters.' },
  { icon: 'shield-checkmark-outline', title: 'Decision Support', body: 'Know what to do before problems happen.' },
];

const DONE_POINTS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'wallet-outline', title: 'Track your money in one place', body: 'Real-time visibility across all family accounts.' },
  { icon: 'sparkles-outline', title: 'Set rules and automate finances', body: 'Intelligent transfers and savings goals.' },
  { icon: 'person-add-outline', title: 'Invite family, manage together', body: 'Shared control with customizable permissions.' },
];

/** Feature slide — Patria checkpoint tile: white rounded square, gold icon, soft ring. */
function FeatureSlide({ slide }: { slide: Extract<Slide, { kind: 'feature' }> }) {
  return (
    <View className="items-center">
      <View className="items-center justify-center">
        <View
          className="absolute rounded-full"
          style={{ height: 150, width: 150, borderWidth: 2, borderColor: 'rgba(255,204,0,0.25)' }}
        />
        <View className="h-28 w-28 items-center justify-center rounded-3xl bg-white" style={shadow.card}>
          <Ionicons name={slide.icon} size={54} color={colors.goldDeep} />
        </View>
      </View>
      <Text className="mt-10 text-center text-[28px] font-extrabold leading-9 tracking-tight text-ink">
        {slide.title}
      </Text>
      <Text className="mt-4 text-center text-[15px] leading-6 text-muted">{slide.body}</Text>
      {slide.chips ? (
        <View className="mt-5 flex-row items-center" style={{ gap: 8 }}>
          {slide.chips.map((c, i) => {
            const gold = i === slide.chips!.length - 1;
            return (
              <View
                key={c}
                className={`rounded-full px-3 py-1.5 ${gold ? '' : 'bg-success-soft'}`}
                style={gold ? { backgroundColor: GOLD_CONTAINER } : undefined}
              >
                <Text
                  className={`text-[10px] font-bold uppercase tracking-wider ${gold ? '' : 'text-brand'}`}
                  style={gold ? { color: ON_GOLD } : undefined}
                >
                  {c}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Meet Steward — gold mascot badge, value points and a mini interaction preview. */
function StewardSlide() {
  return (
    <View>
      <View className="items-center">
        <LinearGradient
          colors={gradients.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            { height: 96, width: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
            shadow.gold,
          ]}
        >
          <Ionicons name="shield-half" size={44} color={colors.white} />
        </LinearGradient>
        <Text className="mt-6 text-center text-[28px] font-extrabold tracking-tight text-ink">
          Meet Steward
        </Text>
        <Text className="mt-2 text-center text-[15px] leading-6 text-muted">
          Your personal guide for smarter financial decisions
        </Text>
      </View>

      <View className="mt-7 rounded-3xl bg-white p-4" style={shadow.card}>
        {STEWARD_POINTS.map((p, i) => (
          <View key={p.title} className={`flex-row items-start ${i > 0 ? 'mt-4' : ''}`}>
            <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-gold-soft/60">
              <Ionicons name={p.icon} size={18} color={colors.goldDeep} />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-bold text-ink">{p.title}</Text>
              <Text className="mt-0.5 text-[12px] leading-4 text-muted">{p.body}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Interaction preview */}
      <View className="mt-4 rounded-3xl bg-page-top p-4">
        <Text className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Interaction Preview
        </Text>
        <View className="mt-3 items-end">
          <View
            className="rounded-2xl px-4 py-2.5"
            style={{ backgroundColor: '#C7DFFF', borderTopRightRadius: 4, maxWidth: '80%' }}
          >
            <Text className="text-[12px] font-semibold" style={{ color: '#314863' }}>
              Can I afford this?
            </Text>
          </View>
        </View>
        <View className="mt-3 flex-row items-end">
          <View
            className="mr-2 h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: GOLD_CONTAINER }}
          >
            <Ionicons name="shield-half" size={13} color={ON_GOLD} />
          </View>
          <View
            className="rounded-2xl bg-white px-4 py-2.5"
            style={[{ borderTopLeftRadius: 4, maxWidth: '85%' }, shadow.soft]}
          >
            <Text className="text-[12px] leading-4 text-ink">
              Based on your current treasury, it's better to wait 3 days.
            </Text>
          </View>
        </View>
      </View>

      <View className="mt-4 flex-row items-center justify-center" style={{ gap: 6 }}>
        <Ionicons name="lock-closed" size={13} color={colors.brand} />
        <Text className="text-[10px] font-bold uppercase tracking-widest text-brand">
          Steward only guides — you stay in control
        </Text>
      </View>
    </View>
  );
}

/** Completion — celebratory gold check, "You're All Set" and value recap. */
function DoneSlide() {
  return (
    <View className="items-center">
      <View className="items-center justify-center">
        <View
          className="absolute rounded-full bg-gold-soft"
          style={{ height: 168, width: 168, opacity: 0.45 }}
        />
        <View
          className="h-32 w-32 items-center justify-center rounded-full"
          style={[{ backgroundColor: GOLD_CONTAINER }, shadow.gold]}
        >
          <Ionicons name="checkmark" size={64} color={ON_GOLD_FIXED} />
        </View>
      </View>
      <Text className="mt-9 text-center text-[30px] font-extrabold tracking-tight text-navy">
        You’re All Set
      </Text>
      <Text className="mt-2 text-center text-[15px] leading-6 text-muted">
        This is your family’s financial control system — ready to go
      </Text>

      <View className="mt-7 w-full rounded-3xl bg-page-top p-5">
        {DONE_POINTS.map((p, i) => (
          <View key={p.title} className={`flex-row items-start ${i > 0 ? 'mt-4' : ''}`}>
            <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-white">
              <Ionicons name={p.icon} size={16} color={colors.goldDeep} />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-bold text-ink">{p.title}</Text>
              <Text className="mt-0.5 text-[12px] leading-4 text-muted">{p.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text className="mt-5 text-[10px] font-semibold uppercase tracking-widest text-faded">
        System Activated · Patriai
      </Text>
    </View>
  );
}

/** First-run feature tour ("App Walkthrough"). Marks itself seen on finish/skip. */
export function WalkthroughScreen({ navigation }: AuthScreenProps<'Walkthrough'>) {
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = SLIDES.length - 1;

  const finish = async () => {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.walkthroughSeen, '1');
    } catch {
      // non-fatal — worst case the tour shows again next launch
    }
    navigation.replace('Welcome');
  };

  const goTo = (i: number) => {
    selection();
    scroller.current?.scrollTo({ x: i * SCREEN_W, animated: true });
  };

  return (
    <Screen withBottomInset>
      {/* Onboarding journey header — Skip + gold progress (design language) */}
      <View className="flex-row items-center justify-between px-6 pt-2">
        <Text className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Onboarding Journey
        </Text>
        <Pressable
          onPress={() => {
            selection();
            void finish();
          }}
          hitSlop={8}
          className="rounded-full bg-lav px-4 py-2 active:opacity-80"
        >
          <Text className="text-[13px] font-bold text-navy">Skip</Text>
        </Pressable>
      </View>
      <View className="px-6 pt-2">
        <View className="h-1.5 w-full overflow-hidden rounded-full bg-lav-soft">
          <View
            className="h-full rounded-full"
            style={{
              width: `${((page + 1) / SLIDES.length) * 100}%`,
              backgroundColor: GOLD_CONTAINER,
            }}
          />
        </View>
        <Text className="mt-1.5 self-end text-[10px] font-bold text-gold-deep">
          Step {page + 1} of {SLIDES.length}
        </Text>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
        }
        className="flex-1"
      >
        {SLIDES.map((s) => (
          <ScrollView
            key={s.key}
            style={{ width: SCREEN_W }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              paddingHorizontal: 28,
              paddingVertical: 16,
            }}
          >
            {s.kind === 'feature' ? (
              <FeatureSlide slide={s} />
            ) : s.kind === 'steward' ? (
              <StewardSlide />
            ) : (
              <DoneSlide />
            )}
          </ScrollView>
        ))}
      </ScrollView>

      {/* Dots */}
      <View className="mb-6 mt-2 flex-row items-center justify-center" style={{ gap: 8 }}>
        {SLIDES.map((s, i) => (
          <Pressable key={s.key} onPress={() => goTo(i)} hitSlop={6}>
            <View
              className="h-2 rounded-full"
              style={{
                width: i === page ? 24 : 8,
                backgroundColor: i === page ? GOLD_CONTAINER : colors.lav,
              }}
            />
          </Pressable>
        ))}
      </View>

      <View className="px-6 pb-4">
        {page < last ? (
          <Button title="Next" icon="arrow-forward" onPress={() => goTo(page + 1)} />
        ) : (
          <Button title="Get Started" icon="arrow-forward" onPress={() => void finish()} />
        )}
      </View>
    </Screen>
  );
}
