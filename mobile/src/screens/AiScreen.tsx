import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../components/Screen';
import { colors, gradients, shadow } from '../theme';

function Suggestion({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View className="flex-row items-center rounded-2xl bg-white p-4" style={shadow.soft}>
      <View className="mr-3 h-9 w-9 items-center justify-center rounded-2xl bg-lav-faint">
        <Ionicons name={icon} size={18} color={colors.navy} />
      </View>
      <Text className="flex-1 text-[14px] text-ink">{text}</Text>
    </View>
  );
}

/** Static placeholder — the AI assistant ships with Milestone 4. */
export function AiScreen() {
  return (
    <Screen>
      <View className="flex-1 px-6 pt-4">
        <View className="flex-1 justify-center">
          <View className="items-center">
            <LinearGradient
              colors={gradients.avatar}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[{ height: 84, width: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }, shadow.hero]}
            >
              <Ionicons name="sparkles" size={38} color={colors.brandGlow} />
            </LinearGradient>

            <Text className="mt-7 text-3xl font-extrabold tracking-tight text-ink">Patriai AI</Text>
            <Text className="mt-3 text-center text-[15px] leading-6 text-muted">
              Ask questions about your family's money, get spending insights, and automate allowances —
              all in one conversation.
            </Text>

            <View className="mt-5 flex-row items-center rounded-full bg-success-soft px-4 py-2">
              <Ionicons name="time-outline" size={13} color={colors.brand} style={{ marginRight: 6 }} />
              <Text className="text-[11px] font-bold uppercase tracking-widest text-brand">
                Coming with Milestone 4
              </Text>
            </View>
          </View>

          <View className="mt-8" style={{ gap: 10 }}>
            <Suggestion icon="pie-chart-outline" text="How much did we spend on groceries this month?" />
            <Suggestion icon="trending-up-outline" text="Show my biggest inflows in the last 30 days" />
            <Suggestion icon="repeat-outline" text="Set up a weekly allowance for a shared wallet" />
          </View>
        </View>

        {/* Disabled input mock */}
        <View className="mb-8 flex-row items-center rounded-3xl bg-white p-3" style={shadow.card}>
          <View className="flex-1 rounded-2xl bg-lav-faint px-4 py-3.5">
            <Text className="text-sm text-faded">Ask anything about your finances…</Text>
          </View>
          <View className="ml-3 h-11 w-11 items-center justify-center rounded-2xl bg-lav opacity-60">
            <Ionicons name="arrow-up" size={20} color={colors.navy} />
          </View>
        </View>
      </View>
    </Screen>
  );
}
