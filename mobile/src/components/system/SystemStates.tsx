import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtButton } from '../pt/PtButton';
import { PtText } from '../pt/PtText';
import { PinSheet } from '../PinSheet';
import { useAppStatus, useCheckPin } from '../../api/account';
import { APP_VERSION, STORAGE_KEYS } from '../../config';
import { useAppLock } from '../../store/appLock';
import { useAuth } from '../../store/auth';
import { useNetwork } from '../../store/network';
import { useDeepLink } from '../../store/deepLink';
import { parseDeepLink } from '../../lib/deepLinks';
import { navigationRef } from '../../navigation/ref';
import { runBiometricPrompt } from '../../lib/biometrics';

/** One full-screen state: an icon in a tinted circle, a title, a line, and buttons. */
function StateScreen({
  icon,
  tone,
  title,
  body,
  children,
  footer,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  tone: { bg: string; fg: string };
  title: string;
  body: string;
  children?: React.ReactNode;
  footer: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: pt.surface, paddingTop: insets.top + 40, paddingBottom: Math.max(insets.bottom, 12) + 18, paddingHorizontal: 20 }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, alignItems: 'center', gap: 14 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={icon} size={28} color={tone.fg} />
        </View>
        <PtText variant="headline" style={{ fontSize: 24, lineHeight: 30, textAlign: 'center' }} accessibilityRole="header">
          {title}
        </PtText>
        <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>
          {body}
        </PtText>
        {children}
      </View>
      <View style={{ gap: 6 }}>{footer}</View>
    </View>
  );
}

/**
 * SYS-02 Update required and SYS-03 Maintenance, checked when the app opens.
 * Maintenance pauses sending and approvals; you can still look at balances.
 */
export function AppStatusGate({ children }: { children: React.ReactNode }) {
  const status = useAppStatus(APP_VERSION);
  const [seenMaintenance, setSeenMaintenance] = useState(false);
  const s = status.data;

  if (s?.update_required) {
    return (
      <StateScreen
        icon="download"
        tone={{ bg: pt.brandSoft, fg: pt.brand }}
        title="Time to update"
        body="This version of Patriai is too old to keep your money safe. The update takes about a minute."
        footer={
          <PtButton
            title="Update now"
            onPress={() => void Linking.openURL(Platform.OS === 'ios' ? 'https://apps.apple.com/' : Platform.OS === 'android' ? 'https://play.google.com/store' : 'https://patriai.app')}
          />
        }
      />
    );
  }
  if (s?.maintenance.on && !seenMaintenance) {
    return (
      <StateScreen
        icon="tool"
        tone={{ bg: pt.infoSoft, fg: pt.info }}
        title="We're upgrading Patriai"
        body={`${s.maintenance.until ? `Back by ${s.maintenance.until}. ` : ''}Your money is safe, and rules scheduled for tonight will run when we're back.`}
        footer={
          <>
            <PtButton title="Check status" onPress={() => void status.refetch()} loading={status.isFetching} />
            <PtButton title="Look at my balances" variant="ghost" onPress={() => setSeenMaintenance(true)} />
          </>
        }
      >
        <View style={{ alignSelf: 'stretch', backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 10, marginTop: 8 }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>Still works</Text>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>Receiving money into your account</Text>
          </View>
          <View style={{ height: 1, backgroundColor: pt.line }} />
          <View style={{ gap: 2 }}>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>Paused</Text>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>Sending, approvals and card payments</Text>
          </View>
        </View>
      </StateScreen>
    );
  }
  return <>{children}</>;
}

/** "11:02 pm". */
function clock(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}

/**
 * SYS-04 "You're offline. Showing balances from 11:02 pm." An edge-to-edge strip
 * at the very top of Home (`edge`); elsewhere a rounded strip with Try again.
 */
export function OfflineBanner({ edge = false }: { edge?: boolean }) {
  const offline = useNetwork((s) => s.offline);
  const since = useNetwork((s) => s.snapshot?.at ?? s.lastOnline);
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  if (!offline) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: '#FDEBC8',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: edge ? 20 : 14,
        paddingTop: edge ? insets.top + 10 : 10,
        paddingBottom: 10,
        borderRadius: edge ? 0 : ptRadius.sm,
      }}
    >
      <Feather name="wifi-off" size={15} color="#8F5400" />
      <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 13, lineHeight: 18, color: pt.ink }}>You're offline. Showing balances from {clock(since)}.</Text>
      {edge ? null : (
        <Text onPress={() => void qc.refetchQueries({ type: 'active' })} accessibilityRole="button" style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.brand }}>
          Try again
        </Text>
      )}
    </View>
  );
}

/** SYS-04: when the strip time reads. */
export function offlineClock(ms: number): string {
  return clock(ms);
}

/**
 * SYS-05 Session expired: after the time chosen on ME-07 away from the app,
 * "Welcome back" asks for the PIN (or Face ID) before showing anything.
 */
export function SessionLock() {
  const { lockAfter, locked, lock, unlock } = useAppLock();
  const biometric = useAuth((s) => s.biometricEnabled);
  const check = useCheckPin();
  const away = useRef<number | null>(null);
  const [askPin, setAskPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  // Opening the app counts as coming back too: it may have been closed for hours.
  useEffect(() => {
    if (!useAuth.getState().restored) return;
    void (async () => {
      await useAppLock.getState().hydrate();
      const last = Number((await SecureStore.getItemAsync(STORAGE_KEYS.lastSeen).catch(() => null)) ?? 0);
      const after = useAppLock.getState().lockAfter;
      if (after !== null && Date.now() - last >= after * 60_000) lock();
    })();
  }, [lock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        if (away.current === null) away.current = Date.now();
        void SecureStore.setItemAsync(STORAGE_KEYS.lastSeen, String(away.current)).catch(() => {});
      } else if (state === 'active') {
        const since = away.current;
        away.current = null;
        if (lockAfter !== null && since !== null && Date.now() - since >= lockAfter * 60_000) lock();
      }
    });
    return () => sub.remove();
  }, [lockAfter, lock]);

  if (!locked) return null;

  const unlockWithFace = async () => {
    if (await runBiometricPrompt('Unlock Patriai')) unlock();
  };

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: pt.surface, paddingTop: insets.top + 60, paddingBottom: Math.max(insets.bottom, 12) + 18, paddingHorizontal: 20 }}>
      <View style={{ flex: 1, alignItems: 'center', gap: 14 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="clock" size={28} color={pt.brand} />
        </View>
        <PtText variant="headline" style={{ fontSize: 24, textAlign: 'center' }} accessibilityRole="header">Welcome back</PtText>
        <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>
          You were away for a while, so we locked Patriai. Enter your PIN to carry on where you left off.
        </PtText>
      </View>
      <View style={{ gap: 6 }}>
        <PtButton title="Enter PIN" onPress={() => { setError(null); setAskPin(true); }} />
        {biometric ? <PtButton title="Use Face ID" variant="ghost" onPress={() => void unlockWithFace()} /> : null}
      </View>
      <PinSheet
        visible={askPin}
        title="Enter your PIN"
        allowBiometric={false}
        loading={check.isPending}
        error={error}
        onSubmit={(pin) =>
          check.mutate(
            { pin },
            {
              onSuccess: () => {
                setAskPin(false);
                unlock();
              },
              onError: (e) => setError(e.message),
            },
          )
        }
        onClose={() => setAskPin(false)}
      />
    </View>
  );
}

/** SYS-06 Something went wrong: "That's on us, not you. Nothing was sent or changed." */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode; onRetry?: () => void; onSupport?: () => void }, { error: Error | null; at: Date | null }> {
  state = { error: null as Error | null, at: null as Date | null };

  static getDerivedStateFromError(error: Error) {
    return { error, at: new Date() };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const at = this.state.at ?? new Date();
    const stamp = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}:${String(at.getSeconds()).padStart(2, '0')}`;
    return (
      <StateScreen
        icon="alert-triangle"
        tone={{ bg: pt.dangerSoft, fg: pt.danger }}
        title="Something went wrong"
        body="That's on us, not you. Nothing was sent or changed. Try again in a moment."
        footer={
          <>
            <PtButton
              title="Try again"
              onPress={() => {
                this.props.onRetry?.();
                this.setState({ error: null, at: null });
              }}
            />
            {this.props.onSupport && useAuth.getState().status === 'authed' ? (
              <PtButton
                title="Contact support"
                variant="ghost"
                onPress={() => {
                  this.props.onSupport?.();
                  this.setState({ error: null, at: null });
                }}
              />
            ) : null}
          </>
        }
      >
        <Text style={{ fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12, color: pt.inkSubtle }}>Error PT-500 · {stamp}</Text>
      </StateScreen>
    );
  }
}

/**
 * SYS-08: a link the app was opened with (or got while open) waits here until
 * the person is signed in and past the PIN, then opens on "Opening …".
 * Referral codes wait for sign-up instead when nobody is signed in.
 */
export function DeepLinkHandler() {
  const status = useAuth((s) => s.status);
  const locked = useAppLock((s) => s.locked);
  const pending = useDeepLink((s) => s.pending);
  const setPending = useDeepLink((s) => s.setPending);

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      const link = parseDeepLink(url);
      if (link) setPending(link);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      const link = parseDeepLink(url);
      if (link) setPending(link);
    });
    return () => sub.remove();
  }, [setPending]);

  useEffect(() => {
    if (!pending || status !== 'authed' || locked) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (!navigationRef.isReady()) {
        if (tries > 20) clearInterval(timer);
        return;
      }
      clearInterval(timer);
      setPending(null);
      navigationRef.navigate('DeepLink', { link: pending });
    }, 250);
    return () => clearInterval(timer);
  }, [pending, status, locked, setPending]);

  return null;
}
