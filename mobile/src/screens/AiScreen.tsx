import React from 'react';
import { Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';

/** Static placeholder — the AI assistant ships with Milestone 4. */
export function AiScreen() {
  return (
    <Screen>
      <View className="flex-1 px-6">
        <View className="flex-1 items-center justify-center">
          <View
            className="h-20 w-20 items-center justify-center rounded-3xl bg-navy"
            style={{
              shadowColor: '#001736',
              shadowOpacity: 0.25,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 6,
            }}
          >
            <Text className="text-3xl text-brand-glow">✦</Text>
          </View>

          <Text className="mt-8 text-2xl font-bold text-ink">Patriai AI Assistant</Text>
          <Text className="mt-3 text-center text-sm leading-6 text-muted">
            Ask questions about your family's money, get spending insights, and automate
            allowances — all in one conversation.
          </Text>

          <View className="mt-6 rounded-full bg-success px-4 py-2">
            <Text className="text-[11px] font-bold tracking-widest text-brand">
              COMING WITH MILESTONE 4
            </Text>
          </View>
        </View>

        {/* Disabled input mock */}
        <Card className="mb-8 flex-row items-center p-3 opacity-60">
          <View className="flex-1 rounded-2xl bg-lav-faint px-4 py-3.5">
            <Text className="text-sm text-faded">Ask anything about your finances…</Text>
          </View>
          <View className="ml-3 h-11 w-11 items-center justify-center rounded-2xl bg-lav">
            <Text className="text-base text-navy">↑</Text>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
