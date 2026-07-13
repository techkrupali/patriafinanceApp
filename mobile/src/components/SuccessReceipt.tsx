import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { Card } from './Card';
import { colors } from '../theme';
import { notifySuccess } from '../lib/haptics';

interface ReceiptRow {
  label: string;
  value: string;
}

interface SuccessReceiptProps {
  title: string;
  subtitle?: string;
  rows: ReceiptRow[];
  onDone: () => void;
  onShare?: () => void;
}

/** Full-screen success state: calm animated blue check + summary card + actions. */
export function SuccessReceipt({ title, subtitle, rows, onDone, onShare }: SuccessReceiptProps) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    notifySuccess();
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}
    >
      <Animated.View className="items-center" style={{ opacity }}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <View className="h-28 w-28 items-center justify-center rounded-full bg-success-soft">
            <View
              className="items-center justify-center rounded-full bg-brand"
              style={{ height: 84, width: 84 }}
            >
              <Ionicons name="checkmark-sharp" size={44} color={colors.white} />
            </View>
          </View>
        </Animated.View>
        <Text className="mt-6 text-2xl font-bold tracking-tight text-ink">{title}</Text>
        {subtitle ? <Text className="mt-2 text-center text-sm text-muted">{subtitle}</Text> : null}
      </Animated.View>

      <Card className="mt-8">
        {rows.map((row, i) => (
          <View
            key={row.label}
            className="flex-row items-center justify-between py-3"
            style={
              i < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined
            }
          >
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {row.label}
            </Text>
            <Text
              className="ml-4 flex-1 text-right text-[15px] font-semibold text-ink"
              numberOfLines={1}
            >
              {row.value}
            </Text>
          </View>
        ))}
      </Card>

      <Button title="Done" icon="checkmark" onPress={onDone} className="mt-8" />
      {onShare ? (
        <Button title="Share receipt" variant="ghost" icon="share-outline" onPress={onShare} className="mt-2" />
      ) : null}
    </ScrollView>
  );
}
