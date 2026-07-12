import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button } from './Button';
import { Card } from './Card';

interface ReceiptRow {
  label: string;
  value: string;
}

interface SuccessReceiptProps {
  title: string;
  subtitle?: string;
  rows: ReceiptRow[];
  onDone: () => void;
}

/** Full-screen success state: glowing green check + summary card + Done. */
export function SuccessReceipt({ title, subtitle, rows, onDone }: SuccessReceiptProps) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}
    >
      <View className="items-center">
        <View className="h-28 w-28 items-center justify-center rounded-full bg-success">
          <View
            className="h-20 w-20 items-center justify-center rounded-full bg-brand"
            style={{
              shadowColor: '#6cf8bb',
              shadowOpacity: 0.9,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 0 },
              elevation: 8,
            }}
          >
            <Text className="text-4xl font-bold text-white">✓</Text>
          </View>
        </View>
        <Text className="mt-6 text-2xl font-bold text-ink">{title}</Text>
        {subtitle ? (
          <Text className="mt-2 text-center text-sm text-muted">{subtitle}</Text>
        ) : null}
      </View>

      <Card className="mt-8">
        {rows.map((row, i) => (
          <View
            key={row.label}
            className={`flex-row items-center justify-between py-3 ${
              i < rows.length - 1 ? 'border-b border-border' : ''
            }`}
            style={i < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: '#e2e8f0' } : undefined}
          >
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              {row.label}
            </Text>
            <Text className="ml-4 flex-1 text-right text-[15px] font-semibold text-ink" numberOfLines={1}>
              {row.value}
            </Text>
          </View>
        ))}
      </Card>

      <Button title="Done" onPress={onDone} className="mt-8" />
    </ScrollView>
  );
}
