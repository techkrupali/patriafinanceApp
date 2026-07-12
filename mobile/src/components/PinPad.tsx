import React from 'react';
import { Pressable, Text, View } from 'react-native';

interface PinPadProps {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  className?: string;
}

const KEYS: (string | 'back' | null)[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', 'back'];

/** 4-dot PIN entry with a borderless numeric keypad. */
export function PinPad({ value, onChange, length = 4, className = '' }: PinPadProps) {
  const press = (key: string | 'back' | null) => {
    if (key === null) return;
    if (key === 'back') {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= length) return;
    onChange(value + key);
  };

  return (
    <View className={`w-full items-center ${className}`}>
      {/* Dots */}
      <View className="mb-8 flex-row items-center justify-center" style={{ gap: 18 }}>
        {Array.from({ length }).map((_, i) => (
          <View
            key={i}
            className={`h-4 w-4 rounded-full ${i < value.length ? 'bg-navy' : 'bg-lav'}`}
          />
        ))}
      </View>

      {/* Keypad */}
      <View className="w-full max-w-[300px] flex-row flex-wrap justify-center">
        {KEYS.map((key, idx) => (
          <Pressable
            key={idx}
            onPress={() => press(key)}
            disabled={key === null}
            className="h-[72px] items-center justify-center active:opacity-60"
            style={{ width: '33.33%' }}
          >
            {key === 'back' ? (
              <Text className="text-2xl text-ink">⌫</Text>
            ) : key !== null ? (
              <Text className="text-3xl font-medium text-ink">{key}</Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
