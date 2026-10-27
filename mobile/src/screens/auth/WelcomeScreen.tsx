import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont } from '../../theme';
import { LogoMark, PtLogo } from '../../components/pt/PtLogo';
import { PtButton } from '../../components/pt/PtButton';
import { useOnboardingCopy } from '../../lib/onboardingCopy';
import { selection } from '../../lib/haptics';
import { useAuth } from '../../store/auth';
import type { AuthScreenProps } from '../../navigation/types';

const SLIDE_MS = 5000;

/**
 * ONB-01 Welcome: emerald canvas with the oversized logo rings, the
 * "See it. Agree on it. Grow it." headline, three swipeable lines of copy with
 * pager dots, the mint Create account button, and Log in / I have an invite.
 */
export function WelcomeScreen({ navigation }: AuthScreenProps<'Welcome'>) {
  const copy = useOnboardingCopy();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const setPostAuthRoute = useAuth((s) => s.setPostAuthRoute);
  const [slide, setSlide] = useState(0);
  const [touched, setTouched] = useState(false);
  const pager = useRef<ScrollView>(null);
  const pageWidth = width - 48;

  // Rotate the copy until the person swipes it themselves.
  useEffect(() => {
    if (touched) return;
    const t = setTimeout(() => {
      const next = (slide + 1) % copy.welcome.slides.length;
      pager.current?.scrollTo({ x: next * pageWidth, animated: true });
      setSlide(next);
    }, SLIDE_MS);
    return () => clearTimeout(t);
  }, [slide, touched, pageWidth, copy.welcome.slides.length]);

  // The artwork is drawn for a 390pt-wide frame; scale it with the screen.
  const s = width / 390;

  const start = (invite: boolean) => {
    // An invite is matched to the phone number at sign-up; open it once inside.
    setPostAuthRoute(invite ? 'Invitations' : null);
    navigation.navigate('Phone');
  };

  return (
    <View style={{ flex: 1, backgroundColor: pt.emerald900, overflow: 'hidden' }}>
      <StatusBar style="light" />

      <View pointerEvents="none" style={{ position: 'absolute', left: -6.4 * s, top: 143.6 * s }}>
        <LogoMark
          size={492.8 * s}
          stroke={5}
          seedR={11}
          seedCy={75}
          colors={{ outer: pt.emerald700, middle: pt.emerald500, seed: pt.gold500 }}
        />
      </View>

      <View style={{ position: 'absolute', left: 24, top: insets.top + 16 }}>
        <PtLogo height={30} onDark />
      </View>

      <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 12) + 22 }}>
        <View style={{ gap: 16 }}>
          <Text
            accessibilityRole="header"
            style={{ fontFamily: ptFont.extrabold, fontSize: 40, lineHeight: 44, letterSpacing: -1.2, color: pt.emerald50 }}
          >
            {copy.welcome.lines[0]}
            {'\n'}
            {copy.welcome.lines[1]}
            {'\n'}
            <Text style={{ color: pt.gold500 }}>{copy.welcome.lines[2]}</Text>
          </Text>

          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScrollBeginDrag={() => setTouched(true)}
            onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / pageWidth))}
          >
            {copy.welcome.slides.map((body) => (
              <Text
                key={body}
                style={{ width: pageWidth, fontFamily: ptFont.regular, fontSize: 16, lineHeight: 24, color: pt.onDarkMuted }}
              >
                {body}
              </Text>
            ))}
          </ScrollView>

          <View
            accessibilityLabel={`Slide ${slide + 1} of ${copy.welcome.slides.length}`}
            style={{ flexDirection: 'row', gap: 6, marginTop: 4, marginBottom: 8 }}
          >
            {copy.welcome.slides.map((body, i) => (
              <View
                key={body}
                style={{
                  width: i === slide ? 22 : 6,
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: i === slide ? pt.emerald300 : pt.dotIdle,
                }}
              />
            ))}
          </View>

          <PtButton title={copy.welcome.createAccount} variant="mint" onPress={() => start(false)} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Pressable
              onPress={() => {
                selection();
                setPostAuthRoute(null);
                navigation.navigate('Login');
              }}
              hitSlop={6}
              accessibilityRole="button"
              style={{ paddingVertical: 12 }}
            >
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.emerald300 }}>{copy.welcome.logIn}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                selection();
                start(true);
              }}
              hitSlop={6}
              accessibilityRole="button"
              style={{ paddingVertical: 12 }}
            >
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.emerald300 }}>{copy.welcome.invite}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
