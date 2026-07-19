import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../../config';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { Logo } from '../../components/Logo';
import { colors, shadow } from '../../theme';
import type { AuthScreenProps } from '../../navigation/types';

/** Greetings across the languages Patriai serves — cycled Apple-style. */
const GREETINGS = ['Welcome', 'Sannu', 'Ẹ káàbọ̀', 'Nnọọ', 'Barka', 'Karibu', 'Bienvenue'];

function AnimatedGreeting() {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    let i = 0;
    let alive = true;

    const enter = () => {
      opacity.setValue(0);
      translateY.setValue(14);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    };

    enter();
    const timer = setInterval(() => {
      if (!alive) return;
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -14, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => {
        if (!alive) return;
        i = (i + 1) % GREETINGS.length;
        setIndex(i);
        enter();
      });
    }, 2200);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [opacity, translateY]);

  return (
    <Animated.Text
      className="text-[44px] font-extrabold tracking-tight text-ink"
      style={{ opacity, transform: [{ translateY }] }}
      numberOfLines={1}
    >
      {GREETINGS[index]}
    </Animated.Text>
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

  // Gentle logo entrance.
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const bodyOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 520, useNativeDriver: true }),
      ]),
      Animated.timing(bodyOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]).start();
  }, [logoScale, logoOpacity, bodyOpacity]);

  return (
    <Screen withBottomInset>
      <View className="flex-1 items-center justify-center px-8">
        <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
          <Logo size={104} />
        </Animated.View>

        <View className="mt-14 h-14 items-center justify-center">
          <AnimatedGreeting />
        </View>

        <Animated.View style={{ opacity: bodyOpacity }} className="items-center">
          <Text className="mt-2 text-[17px] font-bold uppercase tracking-[6px] text-brand">Patriai</Text>
          <Text className="mt-5 max-w-[300px] text-center text-[15px] leading-7 text-muted">
            A structured approach to institutional wealth and effortless digital movement.
          </Text>

          <View
            className="mt-8 flex-row items-center rounded-full border border-lav bg-white px-4 py-2.5"
            style={shadow.soft}
          >
            <Ionicons name="shield-checkmark" size={14} color={colors.gold} style={{ marginRight: 7 }} />
            <Text className="text-[11px] font-bold uppercase tracking-widest text-navy">Secure Portal</Text>
          </View>
        </Animated.View>
      </View>

      <View className="px-6 pb-4" style={{ gap: 14 }}>
        <Button title="Get Started" icon="arrow-forward" onPress={() => navigation.navigate('Register')} />
        <Button title="Log In" variant="secondary" onPress={() => navigation.navigate('Login')} />
      </View>
    </Screen>
  );
}
