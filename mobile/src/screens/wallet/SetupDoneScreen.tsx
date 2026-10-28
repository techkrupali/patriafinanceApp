import React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtButton } from '../../components/pt/PtButton';
import { PtRing } from '../../components/pt/PtRing';
import { useWallet } from '../../api/hooks';
import { PtNote } from '../../components/pt/PtForm';
import { formatMoney, formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

/** Mint halo, emerald disc, white tick and a gold dot (WCR-07). */
function Done() {
  return (
    <View style={{ width: 128, height: 128, borderRadius: 64, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: pt.emerald700, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="check" size={36} color="#FFFFFF" />
      </View>
      <View style={{ position: 'absolute', top: 8, right: 10, width: 14, height: 14, borderRadius: 7, backgroundColor: pt.gold500 }} />
    </View>
  );
}

/**
 * WCR-07 "House rent is ready" / "The health fund is ready": progress on a dark
 * card, then what happened — invites sent, rules added — and where to go next.
 * A spending wallet shows its categories instead; a giving wallet what goes out
 * first.
 */
export function SetupDoneScreen({ navigation, route }: RootScreenProps<'SetupDone'>) {
  const { walletId, title, subtitle, caption, events, openLabel, budget, payments, note } = route.params;
  const insets = useSafeAreaInsets();
  const detail = useWallet(walletId);
  const wallet = detail.data?.wallet;
  const balance = parseFloat(wallet?.balance ?? '0');
  const target = parseFloat(wallet?.target_amount ?? '');
  const pct = Number.isFinite(target) && target > 0 ? Math.min(100, (balance / target) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface, paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 40, paddingBottom: 24, alignItems: 'center', gap: 20 }}>
        <Done />
        <View style={{ gap: 10, alignItems: 'center' }}>
          <Text
            style={{ fontFamily: ptFont.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.7, color: pt.ink, textAlign: 'center' }}
            accessibilityRole="header"
          >
            {title}
          </Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted, textAlign: 'center' }}>{subtitle}</Text>
        </View>

        {budget?.length ? (
          <View style={{ alignSelf: 'stretch', backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16, paddingVertical: 6 }}>
            {budget.map((c, i) => (
              <View key={c.name} style={{ paddingVertical: 12, gap: 8, borderBottomWidth: i === budget.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>₦0 of {formatNaira(c.limit)}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: pt.line }} />
              </View>
            ))}
          </View>
        ) : payments?.length ? (
          <View style={{ alignSelf: 'stretch', backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16, paddingVertical: 4 }}>
            {payments.map((p, i) => (
              <View
                key={`${p.title}-${i}`}
                style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === payments.length - 1 ? 0 : 1, borderBottomColor: pt.line }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="calendar" size={18} color={pt.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{p.title}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
                    {p.sub}
                  </Text>
                </View>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(p.amount)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ alignSelf: 'stretch', backgroundColor: pt.emerald900, borderRadius: ptRadius.md, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            {detail.isLoading ? (
              <ActivityIndicator color={pt.emerald300} />
            ) : (
              <PtRing percent={pct} size={64} stroke={6} track="rgba(255,255,255,0.18)" labelColor="#FFFFFF" />
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: ptFont.medium, fontSize: 12, color: pt.emerald300 }} numberOfLines={1}>
                {wallet?.name ?? ''}
              </Text>
              <Text style={{ fontFamily: ptFont.extrabold, fontSize: 24, color: '#FFFFFF' }}>{formatMoney(wallet?.balance ?? '0')}</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.onDarkMuted }}>{caption}</Text>
            </View>
          </View>
        )}

        {events.length > 0 ? (
          <View style={{ alignSelf: 'stretch', backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16, paddingVertical: 4 }}>
            {events.map((e, i) => (
              <View key={`${e.label}-${i}`} style={{ paddingVertical: 10, gap: 1, borderBottomWidth: i === events.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{e.label}</Text>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 16, lineHeight: 22, color: pt.ink }}>{e.title}</Text>
                {e.sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{e.sub}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
        {note ? (
          <View style={{ alignSelf: 'stretch' }}>
            <PtNote tone="attention">{note}</PtNote>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 10, gap: 10 }}>
        <PtButton title={openLabel} onPress={() => navigation.replace('WalletDetail', { walletId })} />
        <PtButton
          title="Back to Treasury"
          variant="ghost"
          onPress={() => {
            navigation.popToTop();
            navigation.navigate('Tabs', { screen: 'Treasury' });
          }}
        />
      </View>
    </View>
  );
}
