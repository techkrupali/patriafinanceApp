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
        <LinearGradient
          colors={gradients.avatar}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[{ height: 88, width: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }, shadow.hero]}
        >
          <MaterialCommunityIcons name="bank" size={42} color={colors.brandGlow} />
        </LinearGradient>

        <Text className="mt-9 text-5xl font-extrabold tracking-tight text-ink">Patriai</Text>
        <Text className="mt-4 text-center text-[15px] leading-6 text-muted">
          A structured approach to institutional wealth and effortless digital movement.
        </Text>

        <View className="mt-8 flex-row items-center rounded-full bg-lav-faint px-4 py-2">
          <Ionicons name="lock-closed" size={13} color={colors.brand} style={{ marginRight: 6 }} />
          <Text className="text-[11px] font-bold uppercase tracking-widest text-navy">Secure Portal</Text>
        </View>
      </View>

      <View className="px-6 pb-4" style={{ gap: 12 }}>
        <Button title="Get Started" icon="arrow-forward" onPress={() => navigation.navigate('Register')} />
        <Button title="Log In" variant="secondary" onPress={() => navigation.navigate('Login')} />
      </View>
    </Screen>
  );
}
