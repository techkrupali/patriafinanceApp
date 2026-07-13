import './global.css';
import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuth } from './src/store/auth';
import { colors } from './src/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000,
    },
  },
});

function Splash() {
  return (
    <View className="flex-1 bg-page">
      <StatusBar style="dark" />
      <View className="flex-1 items-center justify-center">
        <View className="h-20 w-20 items-center justify-center rounded-3xl bg-lav-soft">
          <Ionicons name="shield-checkmark-outline" size={38} color={colors.brand} />
        </View>
        <Text className="mt-6 text-2xl font-semibold tracking-tight text-ink">Patriai</Text>
        <Text className="mt-1 text-xs font-medium uppercase tracking-widest text-muted">
          Secure Portal
        </Text>
        <ActivityIndicator className="mt-8" color={colors.brand} />
      </View>
    </View>
  );
}

function Gate() {
  const status = useAuth((s) => s.status);
  const hydrate = useAuth((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === 'loading') return <Splash />;
  return <RootNavigator />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <Gate />
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
