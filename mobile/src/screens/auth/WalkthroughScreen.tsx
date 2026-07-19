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

interface Slide {
  icon: IconName;
  gradient: readonly [string, string, ...string[]];
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'wallet',
    gradient: gradients.navy,
    title: 'A wallet for everything',
    body: 'Child allowances, shared family funds, savings goals and project escrows — each with its own account number anyone can pay into.',
  },
  {
    icon: 'people',
    gradient: gradients.brand,
    title: 'Money, together',
    body: 'Invite family with roles and fine-grained permissions. Big spends can require approval — and kids can request money instead of taking it.',
  },
  {
    icon: 'flash',
    gradient: gradients.navy,
    title: 'Put it on autopilot',
    body: 'Automations move allowances and savings on a schedule, goals track your progress, and every change is written to an audit log.',
  },
  {
    icon: 'shield-checkmark',
    gradient: gradients.brand,
    title: 'Safe by design',
    body: 'PIN on every spend, biometric unlock, wallet freezing and spend windows. Your family’s money, protected.',
  },
];

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
      {/* Skip */}
      <View className="flex-row justify-end px-5 pt-2">
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
          <View key={s.title} style={{ width: SCREEN_W }} className="items-center justify-center px-8">
            <LinearGradient
              colors={s.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                {
                  height: 140,
                  width: 140,
                  borderRadius: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                shadow.hero,
              ]}
            >
              <Ionicons name={s.icon} size={64} color={colors.white} />
            </LinearGradient>
            <Text className="mt-10 text-center text-[28px] font-extrabold leading-9 tracking-tight text-ink">
              {s.title}
            </Text>
            <Text className="mt-4 text-center text-[15px] leading-6 text-muted">{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View className="mb-6 flex-row items-center justify-center" style={{ gap: 8 }}>
        {SLIDES.map((s, i) => (
          <Pressable key={s.title} onPress={() => goTo(i)} hitSlop={6}>
            <View
              className={`h-2 rounded-full ${i === page ? 'bg-brand' : 'bg-lav'}`}
              style={{ width: i === page ? 24 : 8 }}
            />
          </Pressable>
        ))}
      </View>

      <View className="px-6 pb-4">
        {page < last ? (
          <Button title="Next" icon="arrow-forward" onPress={() => goTo(page + 1)} />
        ) : (
          <Button title="Get started" icon="checkmark" onPress={() => void finish()} />
        )}
      </View>
    </Screen>
  );
}
