import './global.css';
import './src/lib/gh-nativewind';
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/ref';
import { useSystem } from './src/store/system';
import { useAuth } from './src/store/auth';
import { useLanguage } from './src/store/language';
import { useHomePrefs } from './src/store/homePrefs';
import { useAppLock } from './src/store/appLock';
import { useNetwork } from './src/store/network';
import { AppStatusGate, DeepLinkHandler, ErrorBoundary, SessionLock } from './src/components/system/SystemStates';
import { LogoMark, markOnDark, PtLogo } from './src/components/pt/PtLogo';
import { pt } from './src/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000,
    },
  },
});

/** SYS-01 splash: the stacked logo on the inverse emerald surface. */
function Splash({ fontsReady }: { fontsReady: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: pt.emerald900, alignItems: 'center', justifyContent: 'center' }}>
      <StatusBar style="light" />
      {/* The wordmark needs the brand font; until it loads, show the mark alone. */}
      {fontsReady ? <PtLogo height={130} onDark stacked /> : <LogoMark size={101} colors={markOnDark} />}
      <Text style={{ position: 'absolute', bottom: insets.bottom + 48, fontSize: 12, color: pt.emerald300 }}>
        Banking by Assetmatrix MFB
      </Text>
    </View>
  );
}

function Gate() {
  const status = useAuth((s) => s.status);
  const hydrate = useAuth((s) => s.hydrate);
  const hydrateLanguage = useLanguage((s) => s.hydrate);
  const hydrateHomePrefs = useHomePrefs((s) => s.hydrate);
  const hydrateAppLock = useAppLock((s) => s.hydrate);
  const hydrateNetwork = useNetwork((s) => s.hydrate);
  // ME-13 "Bigger text — follows your phone's text size".
  const biggerText = useAppLock((s) => s.biggerText);
  (Text as unknown as { defaultProps?: Record<string, unknown> }).defaultProps = {
    ...((Text as unknown as { defaultProps?: Record<string, unknown> }).defaultProps ?? {}),
    allowFontScaling: biggerText,
  };
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    void hydrateLanguage();
    void hydrateHomePrefs();
    void hydrateAppLock();
    void hydrateNetwork();
    void hydrate();
  }, [hydrate, hydrateLanguage, hydrateHomePrefs, hydrateAppLock, hydrateNetwork]);

  // A font that fails to load falls back to the system font rather than blocking.
  const fontsReady = fontsLoaded || Boolean(fontError);
  if (status === 'loading' || !fontsReady) return <Splash fontsReady={fontsLoaded} />;
  return (
    // SYS-02/03 first; SYS-05 locks the signed-in app after time away.
    <AppStatusGate>
      <RootNavigator />
      {status === 'authed' ? <SessionLock /> : null}
      <DeepLinkHandler />
    </AppStatusGate>
  );
}

/** SYS-06: start the failed screens again from fresh data. */
function retryAfterError() {
  queryClient.clear();
}

/** SYS-06 "Contact support": the support chat on its own (signed in only). */
function openSupport() {
  queryClient.clear();
  if (useAuth.getState().status === 'authed') useSystem.getState().setSupportOnly(true);
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <NavigationContainer ref={navigationRef}>
            <StatusBar style="dark" />
            <ErrorBoundary onRetry={retryAfterError} onSupport={openSupport}>
              <Gate />
            </ErrorBoundary>
          </NavigationContainer>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
