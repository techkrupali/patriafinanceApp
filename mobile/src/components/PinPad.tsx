import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { tapLight, tapMedium } from '../lib/haptics';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface PinPadProps {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  /** Show a biometric key in the bottom-left; pressing it invokes this callback. */
  onBiometric?: () => void;
  biometricIcon?: IconName;
  className?: string;
}

function Dot({ filled }: { filled: boolean }) {
  const scale = useRef(new Animated.Value(filled ? 1 : 0.55)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: filled ? 1 : 0.55,
      useNativeDriver: true,
      speed: 22,
      bounciness: 12,
    }).start();
  }, [filled, scale]);

  return (
    <Animated.View
      style={{
        height: 16,
        width: 16,
        borderRadius: 8,
        backgroundColor: filled ? colors.brand : colors.lav,
        transform: [{ scale }],
      }}
    />
  );
}

function Key({ children, onPress, disabled }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 50, bounciness: 6 }).start();

  return (
    <View className="items-center justify-center" style={{ width: '33.33%', paddingVertical: 8 }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={onPress}
          onPressIn={() => onPress && to(0.9)}
          onPressOut={() => to(1)}
          disabled={disabled}
          className="h-[72px] w-[72px] items-center justify-center rounded-full"
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** Beautiful numeric PIN entry: animated dot row + rounded keypad with optional biometric key. */
export function PinPad({ value, onChange, length = 4, onBiometric, biometricIcon, className = '' }: PinPadProps) {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  const pressDigit = (d: string) => {
    if (value.length >= length) return;
    tapMedium();
    onChange(value + d);
  };

  const backspace = () => {
    if (value.length === 0) return;
    tapLight();
    onChange(value.slice(0, -1));
  };

  return (
    <View className={`w-full items-center ${className}`}>
      {/* Dots */}
      <View className="mb-9 flex-row items-center justify-center" style={{ gap: 18 }}>
        {Array.from({ length }).map((_, i) => (
          <Dot key={i} filled={i < value.length} />
        ))}
      </View>

      {/* Keypad */}
      <View className="w-full max-w-[320px] flex-row flex-wrap justify-center">
        {digits.map((d) => (
          <Key key={d} onPress={() => pressDigit(d)}>
            <View className="h-16 w-16 items-center justify-center rounded-full bg-lav-faint">
              <Animated.Text style={{ fontSize: 28, fontWeight: '600', color: colors.ink }}>{d}</Animated.Text>
            </View>
          </Key>
        ))}

        {/* Bottom-left: biometric or blank */}
        {onBiometric ? (
          <Key onPress={onBiometric}>
            <View className="h-16 w-16 items-center justify-center rounded-full bg-success-soft">
              <Ionicons name={biometricIcon ?? 'finger-print'} size={28} color={colors.brand} />
            </View>
          </Key>
        ) : (
          <Key disabled>{null}</Key>
        )}

        {/* 0 */}
        <Key onPress={() => pressDigit('0')}>
          <View className="h-16 w-16 items-center justify-center rounded-full bg-lav-faint">
            <Animated.Text style={{ fontSize: 28, fontWeight: '600', color: colors.ink }}>0</Animated.Text>
          </View>
        </Key>

        {/* Backspace */}
        <Key onPress={backspace}>
          <View className="h-16 w-16 items-center justify-center rounded-full">
            <Ionicons name="backspace-outline" size={26} color={colors.muted} />
          </View>
        </Key>
      </View>
    </View>
  );
}
