import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { colors } from '../../theme';
import type { AuthScreenProps } from '../../navigation/types';

export function WelcomeScreen({ navigation }: AuthScreenProps<'Welcome'>) {
  return (
    <Screen withBottomInset>
      {/* Faint blue banner at the very top (decorative — never intercept touches) */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320, backgroundColor: '#f5f8fe' }}
      />

      <View className="flex-1 items-center justify-center px-8">
        <View className="h-[88px] w-[88px] items-center justify-center rounded-[28px] bg-lav-soft">
          <MaterialCommunityIcons name="bank" size={42} color={colors.brand} />
        </View>

        <Text className="mt-9 text-5xl font-semibold tracking-tight text-ink">Patriai</Text>
        <Text className="mt-4 text-center text-[15px] leading-6 text-muted">
          A structured approach to institutional wealth and effortless digital movement.
        </Text>

        <View className="mt-8 flex-row items-center rounded-full bg-lav-soft px-4 py-2">
          <Ionicons name="lock-closed" size={13} color={colors.brand} style={{ marginRight: 6 }} />
          <Text className="text-[11px] font-semibold uppercase tracking-widest text-brand">Secure Portal</Text>
        </View>
      </View>

      <View className="px-6 pb-4" style={{ gap: 12 }}>
        <Button title="Get Started" icon="arrow-forward" onPress={() => navigation.navigate('Register')} />
        <Button title="Log In" variant="secondary" onPress={() => navigation.navigate('Login')} />
      </View>
    </Screen>
  );
}
