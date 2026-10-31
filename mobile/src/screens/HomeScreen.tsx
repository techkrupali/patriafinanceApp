import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../theme';
import { PtAvatar } from '../components/pt/PtAvatar';
import { PtChip } from '../components/pt/PtChip';
import { PtRing } from '../components/pt/PtRing';
import { PtQuickAction } from '../components/pt/PtTabScreen';
import { OfflineBanner, offlineClock } from '../components/system/SystemStates';
import { PtButton } from '../components/pt/PtButton';
import { PtNote } from '../components/pt/PtForm';
import { LoadError } from '../components/LoadError';
import { QuickActionsSheet, type QuickAction } from '../components/QuickActionsSheet';
import { useHome, useWallets } from '../api/hooks';
import { useAuth } from '../store/auth';
import { useHomePrefs } from '../store/homePrefs';
import { useNetwork } from '../store/network';
import { useDeepLink } from '../store/deepLink';
import { permissionsAsked } from './system/PermissionsScreen';
import { useHomeCopy } from '../lib/homeCopy';
import { formatMoney, formatNaira, initials, shortDay } from '../lib/format';
import { inviteTarget } from '../lib/invite';
import { selection } from '../lib/haptics';
import type { HomeNeedItem, HomeUpcomingItem } from '../api/types';
import type { TabScreenProps } from '../navigation/types';

const DOT: Record<HomeUpcomingItem['tone'], string> = {
  warning: '#8F5400',
  danger: pt.danger,
  neutral: pt.lineStrong,
};

/** 40pt white circle button in the Home header. */
function HeaderButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: pt.raised, alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </Pressable>
  );
}

/**
 * Home (prototype HOM-01): greeting, the everything-balance card, quick
 * actions, "N need you", the next 7 days, goal rings and projects. English
 * or Pidgin from the language setting; balances can be hidden (HOM-02) and
 * sections switched off (HOM-08).
 */
export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
  const copy = useHomeCopy();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const home = useHome();
  const wallets = useWallets();
  const hidden = useHomePrefs((s) => s.hidden);
  const toggleHidden = useHomePrefs((s) => s.toggleHidden);
  const sections = useHomePrefs((s) => s.sections);
  const [sheet, setSheet] = useState(false);

  // Money moves on other screens; come back to fresh numbers.
  const refetchHome = home.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchHome();
    }, [refetchHome]),
  );

  const data = home.data;
  const main = (wallets.data ?? []).find((w) => w.type === 'main');
  const offline = useNetwork((n) => n.offline);
  const snapshot = useNetwork((n) => n.snapshot);
  const remember = useNetwork((n) => n.remember);

  // SYS-07: the notifications primer, once per phone (not over a link being opened).
  useEffect(() => {
    void permissionsAsked().then((asked) => {
      if (!asked && !useDeepLink.getState().pending) navigation.navigate('Permissions');
    });
  }, [navigation]);

  // SYS-04: keep the last total so it can show offline, even after a restart.
  const total = data?.totals.total;
  useEffect(() => {
    if (user && total !== undefined && home.isSuccess) remember(user.id, String(total));
  }, [user, total, home.isSuccess, home.dataUpdatedAt, remember]);
  const mask = (s: string) => (hidden ? '₦ ••••' : s);

  const addMoney = () => (main ? navigation.navigate('Fund', { walletId: main.id }) : navigation.navigate('Treasury'));

  const openNeeds = (items: HomeNeedItem[]) => {
    const kinds = new Set(items.map((i) => i.kind));
    if (kinds.has('approval')) navigation.navigate('Approvals', { scope: 'to_me' });
    else if (kinds.has('invitation')) navigation.navigate('Invitations');
    else if (kinds.has('milestone')) navigation.navigate('Projects');
    else navigation.navigate('Rules');
  };

  const openUpcoming = (item: HomeUpcomingItem) => {
    if (item.kind === 'rule') {
      if (item.tone === 'danger') navigation.navigate('Fund', { walletId: item.wallet_id });
      else navigation.navigate('Rules');
    } else {
      navigation.navigate('ApprovalDetail', { approvalId: item.id });
    }
  };

  const onQuickAction = (action: QuickAction) => {
    setSheet(false);
    switch (action) {
      case 'send':
        return navigation.navigate('Transfer');
      case 'add':
        return addMoney();
      case 'wallet':
        return navigation.navigate('CreateWallet');
      case 'goal':
        return navigation.navigate('GoalWalletSetup');
      case 'invite': {
        const t = inviteTarget(wallets.data);
        return t.screen === 'InviteMember' ? navigation.navigate(t.screen, t.params) : navigation.navigate(t.screen);
      }
      default:
        return undefined;
    }
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable
        onPress={() => {
          selection();
          navigation.navigate('More');
        }}
        accessibilityRole="button"
        accessibilityLabel="Profile and settings"
      >
        <PtAvatar initials={initials(user?.full_name)} uri={user?.avatar_url} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{copy.greeting(new Date().getHours())}</Text>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 18, color: pt.ink }} numberOfLines={1}>
          {data?.first_name ?? user?.first_name ?? ''}
        </Text>
      </View>
      <HeaderButton label="Customise home" onPress={() => navigation.navigate('CustomiseHome')}>
        <Feather name="sliders" size={18} color={pt.ink} />
      </HeaderButton>
      <HeaderButton label="Notifications" onPress={() => navigation.navigate('Notifications')}>
        <Feather name="bell" size={18} color={pt.ink} />
        {data && data.unread_notifications > 0 ? (
          <View style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: pt.gold500 }} />
        ) : null}
      </HeaderButton>
    </View>
  );

  // SYS-04 Offline: the last balance we saw, what still works, and Try again.
  if (offline && !home.isLoading) {
    const seen = data ? { total: String(data.totals.total), at: home.dataUpdatedAt } : snapshot && snapshot.userId === user?.id ? snapshot : null;
    return (
      <View style={{ flex: 1, backgroundColor: pt.surface }}>
        <StatusBar style="dark" />
        <OfflineBanner edge />
        <ScrollView contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 20, paddingBottom: 28, gap: 16 }} showsVerticalScrollIndicator={false}>
          <View>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{copy.greeting(new Date().getHours())}</Text>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 20, color: pt.ink }} numberOfLines={1}>
              {data?.first_name ?? user?.first_name ?? ''}
            </Text>
          </View>
          {/* Dimmed: the figure may be out of date. */}
          <View style={{ backgroundColor: pt.emerald900, opacity: 0.85, borderRadius: ptRadius.lg, paddingVertical: 18, paddingHorizontal: 18, gap: 6 }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 11, letterSpacing: 0.88, color: pt.emerald50, opacity: 0.85 }}>
              {seen ? `TOTAL BALANCE · LAST UPDATED ${offlineClock(seen.at).toUpperCase()}` : 'TOTAL BALANCE'}
            </Text>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: pt.emerald50, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
              {!seen ? '₦ —' : hidden ? '₦ ••••••' : formatMoney(seen.total)}
            </Text>
          </View>
          <PtNote tone="info" icon="info">Sending and approving need a connection. Anything you start will wait and ask again when you're back online.</PtNote>
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <PtButton
            title="Try again"
            loading={home.isFetching}
            onPress={() => {
              void home.refetch();
              void wallets.refetch();
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 28, gap: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={home.isRefetching}
            onRefresh={() => {
              void home.refetch();
              void wallets.refetch();
            }}
            tintColor={pt.brand}
          />
        }
      >
        {header}

        {home.isLoading ? (
          <ActivityIndicator color={pt.brand} style={{ marginTop: 48 }} />
        ) : home.error || !data ? (
          <LoadError message={(home.error as Error | null)?.message} onRetry={() => void home.refetch()} />
        ) : (
          <>
            {/* Everything the family can see */}
            <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, paddingVertical: 16, paddingHorizontal: 18, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 11, letterSpacing: 0.88, color: pt.emerald50, opacity: 0.85 }}>
                  {copy.everything(data.wallet_count)}
                </Text>
                <Pressable
                  onPress={() => {
                    selection();
                    toggleHidden();
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={hidden ? 'Show balances' : 'Hide balances'}
                >
                  <Feather name={hidden ? 'eye-off' : 'eye'} size={16} color={pt.emerald50} />
                </Pressable>
              </View>
              <Text
                style={{ fontFamily: ptFont.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: pt.emerald50, fontVariant: ['tabular-nums'] }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {hidden ? '₦ ••••••' : formatMoney(data.totals.total)}
              </Text>
              <Pressable
                onPress={() => {
                  selection();
                  navigation.navigate('Treasury');
                }}
                accessibilityRole="button"
              >
                <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 17, color: pt.emerald50, opacity: 0.9 }}>
                  {copy.breakdown(
                    mask(formatNaira(data.totals.yours)),
                    mask(formatNaira(data.totals.shared)),
                    mask(formatNaira(data.totals.children)),
                  )}
                </Text>
              </Pressable>
            </View>

            {/* Quick actions */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PtQuickAction label={copy.send} icon={<Feather name="send" size={21} color={pt.brand} />} onPress={() => navigation.navigate('Transfer')} />
              <PtQuickAction label={copy.addMoney} icon={<Feather name="arrow-down" size={22} color={pt.brand} />} onPress={addMoney} />
              <PtQuickAction
                label={copy.move}
                icon={<MaterialCommunityIcons name="swap-vertical" size={23} color={pt.brand} />}
                onPress={() => navigation.navigate('Transfer')}
              />
              <PtQuickAction label={copy.more} icon={<Feather name="menu" size={21} color={pt.brand} />} onPress={() => setSheet(true)} />
            </View>

            {/* N need you */}
            {data.needs_you.count > 0 ? (
              <Pressable
                onPress={() => {
                  selection();
                  openNeeds(data.needs_you.items);
                }}
                accessibilityRole="button"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: pt.gold100,
                  borderRadius: ptRadius.md,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                }}
              >
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: pt.gold500, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: '#2A1B00' }}>{data.needs_you.count}</Text>
                </View>
                <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.ink }} numberOfLines={2}>
                  <Text style={{ fontFamily: ptFont.bold }}>{copy.needYou(data.needs_you.count)}</Text>{' '}
                  {data.needs_you.items.map((i) => i.label).join(', ')}
                </Text>
                <Feather name="chevron-right" size={16} color={pt.inkSubtle} />
              </Pressable>
            ) : null}

            {/* Next 7 days */}
            {sections.upcoming ? (
              <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingVertical: 4, paddingHorizontal: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, paddingBottom: 2 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.ink }}>{copy.next7}</Text>
                  <Pressable
                    onPress={() => {
                      selection();
                      navigation.navigate('Rules');
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 12, color: pt.brand }}>{copy.seeAll}</Text>
                  </Pressable>
                </View>
                {data.upcoming.length === 0 ? (
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 17, color: pt.inkMuted, paddingVertical: 12 }}>
                    {copy.nothingDue}
                  </Text>
                ) : (
                  data.upcoming.map((item, i) => (
                    <Pressable
                      key={`${item.kind}-${item.id}`}
                      onPress={() => {
                        selection();
                        openUpcoming(item);
                      }}
                      accessibilityRole="button"
                      style={{
                        minHeight: 48,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 6,
                        borderBottomWidth: i === data.upcoming.length - 1 ? 0 : 1,
                        borderBottomColor: pt.line,
                      }}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: DOT[item.tone] }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.ink }} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text
                          style={{ fontFamily: ptFont.regular, fontSize: 11, color: item.tone === 'danger' ? pt.danger : pt.inkMuted }}
                          numberOfLines={1}
                        >
                          {shortDay(item.date, { today: copy.today })} · {item.subtitle}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.ink, fontVariant: ['tabular-nums'] }}>
                        {mask(formatNaira(item.amount))}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}

            {/* Goal rings */}
            {sections.goals ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -20 }}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 4 }}
              >
                {data.goals.map((g) => (
                  <Pressable
                    key={g.wallet_id}
                    onPress={() => {
                      selection();
                      navigation.navigate('WalletDetail', { walletId: g.wallet_id });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${g.name}, ${g.percent}%`}
                    style={{ width: 92, alignItems: 'center', gap: 6 }}
                  >
                    <PtRing percent={g.percent} />
                    <Text
                      style={{ fontFamily: ptFont.semibold, fontSize: 12, lineHeight: 15, color: pt.ink, textAlign: 'center' }}
                      numberOfLines={2}
                    >
                      {g.name}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    selection();
                    navigation.navigate('GoalWalletSetup');
                  }}
                  accessibilityRole="button"
                  style={{ width: 92, alignItems: 'center', gap: 6 }}
                >
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      borderWidth: 2,
                      borderStyle: 'dashed',
                      borderColor: pt.lineStrong,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="plus" size={20} color={pt.inkMuted} />
                  </View>
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 12, lineHeight: 15, color: pt.inkMuted, textAlign: 'center' }}>
                    {copy.newGoal}
                  </Text>
                </Pressable>
              </ScrollView>
            ) : null}

            {/* Projects */}
            {sections.projects
              ? data.projects.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      selection();
                      navigation.navigate('ProjectDetail', { projectId: p.id });
                    }}
                    accessibilityRole="button"
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      backgroundColor: pt.raised,
                      borderRadius: ptRadius.md,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                    }}
                  >
                    <View
                      style={{ width: 36, height: 36, borderRadius: ptRadius.sm, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <MaterialCommunityIcons name="hard-hat" size={18} color={pt.brand} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.ink }} numberOfLines={1}>
                        {p.title}
                      </Text>
                      <Text style={{ fontFamily: ptFont.regular, fontSize: 11, color: pt.inkMuted }} numberOfLines={1}>
                        {p.status_line}
                      </Text>
                    </View>
                    {p.needs_review ? <PtChip label={copy.review} tone="warning" icon="clock" /> : null}
                  </Pressable>
                ))
              : null}
          </>
        )}
      </ScrollView>

      <QuickActionsSheet visible={sheet} onClose={() => setSheet(false)} onPick={onQuickAction} />
    </View>
  );
}
