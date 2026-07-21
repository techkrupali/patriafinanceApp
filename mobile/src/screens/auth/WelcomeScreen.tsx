import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../../config';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { colors } from '../../theme';
import type { AuthScreenProps } from '../../navigation/types';

/**
 * Stitch "Patria | Secure Entry" splash — milk-white canvas (#FDFCFB) with a
 * soft radial gold glow, the PATRIA wordmark in deep navy with wide tracking,
 * gold hairlines around "LEGACY & WEALTH", pulsing gold dots and the
 * encryption badge above the entry actions.
 */

/** One gold pulse dot (design: opacity 0.3→1, scale 0.8→1.1, staggered). */
function PulseDot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 750, useNativeDriver: true }),
      ]),
    );
    const anim = Animated.sequence([Animated.delay(delay), loop]);
    anim.start();
    return () => anim.stop();
  }, [v, delay]);

  return (
    <Animated.View
      style={{
        height: 8,
        width: 8,
        borderRadius: 999,
        backgroundColor: colors.goldDeep,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.1] }) }],
      }}
    />
  );
}

export function WelcomeScreen({ navigation }: AuthScreenProps<'Welcome'>) {
  // First run only: show the feature tour before anything else.
  useEffect(() => {
    let alive = true;
    void SecureStore.getItemAsync(STORAGE_KEYS.walkthroughSeen)
      .then((seen) => {
        if (alive && !seen) navigation.replace('Walkthrough');
      })
      .catch(() => {
        // Storage hiccup — skip the tour rather than block the app.
      });
    return () => {
      alive = false;
    };
  }, [navigation]);

  // Gentle wordmark entrance.
  const markScale = useRef(new Animated.Value(0.85)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const bodyOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(markScale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.timing(markOpacity, { toValue: 1, duration: 520, useNativeDriver: true }),
      ]),
      Animated.timing(bodyOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]).start();
  }, [markScale, markOpacity, bodyOpacity]);

  return (
    <Screen withBottomInset>
      {/* Milk-white base over the app aurora, per the splash design */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FDFCFB' }]} />
      </View>

      <View className="flex-1 items-center justify-center px-8">
        {/* Radial gold glow approximation (design: rgba(255,204,0,0.15) → transparent) */}
        <View pointerEvents="none" style={styles.glowOuter} />
        <View pointerEvents="none" style={styles.glowInner} />

        <Animated.View
          style={{ opacity: markOpacity, transform: [{ scale: markScale }] }}
          className="items-center"
        >
          <Text
            style={{
              fontSize: 52,
              fontWeight: '900',
              letterSpacing: 7,
              marginRight: -7, // optical centering: RN adds trailing letterSpacing
              color: colors.navy, // on-secondary-fixed #011D35
              includeFontPadding: false,
            }}
          >
            PATRIA
          </Text>

          <View className="mt-4 flex-row items-center justify-center" style={{ gap: 8 }}>
            <View style={styles.hairline} />
            <Text
              className="text-[10px] font-semibold uppercase"
              style={{ letterSpacing: 3, color: 'rgba(73,96,124,0.6)' }}
            >
              Legacy & Wealth
            </Text>
            <View style={styles.hairline} />
          </View>
        </Animated.View>
      </View>

      <Animated.View style={{ opacity: bodyOpacity }} className="items-center px-6 pb-4">
        {/* Pulse indicator */}
        <View className="flex-row" style={{ gap: 8 }}>
          <PulseDot delay={0} />
          <PulseDot delay={200} />
          <PulseDot delay={400} />
        </View>

        {/* Encryption badge */}
        <View className="mt-5 flex-row items-center" style={{ gap: 6, opacity: 0.4 }}>
          <Ionicons name="lock-closed" size={13} color={colors.ink} />
          <Text className="text-[10px] font-medium uppercase text-ink" style={{ letterSpacing: 0.5 }}>
            256-bit Encrypted Environment
          </Text>
        </View>

        <View className="mt-7 w-full" style={{ gap: 14 }}>
          <Button title="Get Started" icon="arrow-forward" onPress={() => navigation.navigate('Register')} />
          <Button title="Log In" variant="secondary" onPress={() => navigation.navigate('Login')} />
        </View>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  glowOuter: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 999,
    backgroundColor: 'rgba(255,204,0,0.06)',
  },
  glowInner: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(255,204,0,0.09)',
  },
  hairline: {
    height: StyleSheet.hairlineWidth * 2,
    width: 32,
    backgroundColor: '#FFCC00', // primary-container hairline per design
  },
});
