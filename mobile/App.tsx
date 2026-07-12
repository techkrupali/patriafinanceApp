import './global.css';
import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuth } from './src/store/auth';

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
    <View className="flex-1 items-center justify-center bg-navy">
      <View className="h-16 w-16 items-center justify-center rounded-2xl bg-white/10" style={{ transform: [{ rotate: '45deg' }] }}>
        <Text className="text-2xl font-bold text-white" style={{ transform: [{ rotate: '-45deg' }] }}>
          P
        </Text>
      </View>
      <Text className="mt-6 text-xl font-bold text-white">Patriai</Text>
      <ActivityIndicator className="mt-6" color="#6cf8bb" />
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
