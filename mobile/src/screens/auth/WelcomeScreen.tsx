import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { colors, gradients, shadow } from '../../theme';
import type { AuthScreenProps } from '../../navigation/types';

export function WelcomeScreen({ navigation }: AuthScreenProps<'Welcome'>) {
  return (
    <Screen withBottomInset>
      {/* Soft brand glow at the top */}
      <LinearGradient
        colors={gradients.glowSoft}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 420 }}
      />

      <View className="flex-1 items-center justify-center px-8">
        {/* Layered glow halo behind the mark for a premium, lit-from-within feel */}
        <View className="items-center justify-center">
          <View
            className="absolute rounded-full bg-brand-glow"
            style={{ height: 220, width: 220, opacity: 0.35 }}
          />
          <View
            className="absolute rounded-full bg-lav-soft"
            style={{ height: 148, width: 148, opacity: 0.9 }}
          />
          <LinearGradient
            colors={gradients.avatar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              { height: 92, width: 92, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
              shadow.hero,
            ]}
          >
            <MaterialCommunityIcons name="bank" size={44} color={colors.brandGlow} />
          </LinearGradient>
        </View>

        <Text className="mt-11 text-[52px] font-extrabold leading-none tracking-tight text-ink">
          Patriai
        </Text>
        <Text className="mt-5 max-w-[300px] text-center text-[15px] leading-7 text-muted">
          A structured approach to institutional wealth and effortless digital movement.
        </Text>

        <View
          className="mt-8 flex-row items-center rounded-full border border-lav bg-white px-4 py-2.5"
          style={shadow.soft}
        >
          <Ionicons name="shield-checkmark" size={14} color={colors.brand} style={{ marginRight: 7 }} />
          <Text className="text-[11px] font-bold uppercase tracking-widest text-navy">Secure Portal</Text>
        </View>
      </View>

      <View className="px-6 pb-4" style={{ gap: 14 }}>
        <Button title="Get Started" icon="arrow-forward" onPress={() => navigation.navigate('Register')} />
        <Button title="Log In" variant="secondary" onPress={() => navigation.navigate('Login')} />
      </View>
    </Screen>
  );
}
