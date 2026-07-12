import React from 'react';
import { Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import type { AuthScreenProps } from '../../navigation/types';

export function WelcomeScreen({ navigation }: AuthScreenProps<'Welcome'>) {
  return (
    <Screen withBottomInset>
      <View className="flex-1 items-center justify-center px-8">
        {/* Brand mark: navy rounded diamond */}
        <View
          className="h-20 w-20 items-center justify-center rounded-3xl bg-navy"
          style={{
            transform: [{ rotate: '45deg' }],
            shadowColor: '#001736',
            shadowOpacity: 0.25,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
          }}
        >
          <Text
            className="text-3xl font-bold text-brand-glow"
            style={{ transform: [{ rotate: '-45deg' }] }}
          >
            ⌂
          </Text>
        </View>

        <Text className="mt-10 text-5xl font-bold text-ink">Patriai</Text>
        <Text className="mt-4 text-center text-base leading-6 text-muted">
          A structured approach to institutional wealth and digital movement.
        </Text>

        <View className="mt-8 flex-row items-center rounded-full border border-lav bg-lav-faint px-4 py-1.5">
          <View className="mr-2 h-2 w-2 rounded-full bg-brand-mint" />
          <Text className="text-[11px] font-bold tracking-widest text-navy">SECURE PORTAL</Text>
        </View>
      </View>

      <View className="px-6 pb-6">
        <Button title="Get Started" onPress={() => navigation.navigate('Register')} />
        <Button
          title="Log In"
          variant="secondary"
          onPress={() => navigation.navigate('Login')}
          className="mt-3"
        />
      </View>
    </Screen>
  );
}
